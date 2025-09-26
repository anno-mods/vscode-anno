import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import * as versionChecks from '../versionChecks';
import * as anno from '../../../anno';
import * as xml from '../../../anno/xml';
import * as rda from '../../../data/rda';
import * as editor from '../../../editor';
import * as utils from '../../../utils';
import * as xmltest from '../../../tools/xmltest';
import * as editorFormats from '../../../editor/formats';

import * as issues7 from './issues7.json';
import * as issues8 from './issues8.json';

export function getIssues(): IIssueDescription[] {
  return editor.ModContext.get().version === anno.GameVersion.Anno7 ? issues7 : issues8;
}

export interface IIssueDescription {
  matchWord?: string
  matchRegex?: string
  fix?: string
  fixMessage?: string
  code: string
  message: string
}

export const GAME_PATH_117 = 'anno.117.gamePath';
const XML_DOUBLE_DASH = 'xml-double-dash-in-comment';
const XML_NESTED_COMMENT = 'xml-nested-comment';

export const diagnosticsCollection = vscode.languages.createDiagnosticCollection('anno');
const performanceDecorationType = vscode.window.createTextEditorDecorationType({});

function checkFileName(modPaths: string[], line: string, lineIndex: number, annoRda?: string) {
  const regEx = /<(Filename|FileName|IconFilename|RecipeImage|RecipeListMoodImage)>([^<]+)<\/\1>/g;
  let match = regEx.exec(line);
  let checked;
  if (match && (checked = anno.hasGraphicsFile(modPaths, match[2], annoRda)).length > 0) {
    const index = line.indexOf(match[2]);
    const range = new vscode.Range(lineIndex, index, lineIndex, index + match[2].length);

    const allPaths = annoRda ? [annoRda, ...modPaths] : modPaths;

    const diagnostic = new vscode.Diagnostic(range,
      `File seems to be missing.\nChecked paths:\n${allPaths.join('\n')}\nChecked patterns:\n${checked.join('\n')}`,
      vscode.DiagnosticSeverity.Warning);
    return diagnostic;
  }

  return undefined;
};

export function clearDiagnostics(fileUri: vscode.Uri, performanceOnly: boolean = false) {
  vscode.window.activeTextEditor?.setDecorations(performanceDecorationType, []);

  if (!performanceOnly) {
    diagnosticsCollection.delete(fileUri)
  }
}

export function refreshDiagnostics(context: vscode.ExtensionContext, doc: vscode.TextDocument, performanceDiagnostics: boolean = true): void {
  if (!editor.isActive()) {
    return;
  }

  if (!editorFormats.isPatchXml(doc)) {
    vscode.commands.executeCommand('setContext', 'anno-modding-tools.openPatchFile', false);
    return;
  }
  vscode.commands.executeCommand('setContext', 'anno-modding-tools.openPatchFile', true);

  const config = vscode.workspace.getConfiguration('anno');
  const checkFileNames = vscode.workspace.getConfiguration('anno', doc.uri).get('checkFileNames');
  const annoRda: string | undefined = config.get('rdaFolder'); // TODO
  const modsFolder: string | undefined = config.get('modsFolder'); // TODO

  const modPaths = anno.searchModPaths(doc.uri.fsPath, modsFolder);
  const modPath = anno.findModRoot(doc.fileName);
  const version = anno.ModInfo.readVersion(modPath);

  const result: vscode.Diagnostic[] = [];
  result.push(...versionChecks.checkFilePaths(doc, version));

  var inComment = false;

  // line diagonstics
  const issues = getIssues();
  for (let lineIndex = 0; lineIndex < doc.lineCount; lineIndex++) {
    const lineOfText = doc.lineAt(lineIndex);

    var line, comment;
    [ line, inComment, comment ] = xml.removeComments(lineOfText.text, inComment);

    if (comment.trim()) {
      const [ problem, found ] = utils.indexOfFirst(comment, '<!--', '--');
      if (problem >= 0) {
        const range = new vscode.Range(lineIndex, problem, lineIndex, problem + found.length);
        const diagnostic = new vscode.Diagnostic(range,
          found === '--' ? 'The string "--" is not allowed within comments.' : 'Comments are not allowed within comments.',
          vscode.DiagnosticSeverity.Error);
        diagnostic.code = found === '--' ? XML_DOUBLE_DASH : XML_NESTED_COMMENT;
        diagnostic.source = 'anno';
        result.push(diagnostic);
      }
    }

    if (!line.trim()) {
      continue;
    }

    for (var issue of issues) {
      const detected = checkDiagnosticIssue(line, lineIndex, issue);
      if (detected) {
        result.push(detected);
      }
    }

    if (checkFileNames) {
      const fileAction = checkFileName(modPaths, line, lineIndex, annoRda);
      if (fileAction) {
        result.push(fileAction);
      }
    }
  }

  if (performanceDiagnostics && editorFormats.allowLiveValidation(doc)) {
    const performance = runXmlTest(context, doc, result);
    vscode.window.activeTextEditor?.setDecorations(performanceDecorationType, performance);
  }

  diagnosticsCollection.set(doc.uri, result);
}

function runXmlTest(context: vscode.ExtensionContext, doc: vscode.TextDocument,
  result: vscode.Diagnostic[]): vscode.DecorationOptions[] {

  const decorations: vscode.DecorationOptions[] = [];

  let modPath = anno.findModRoot(doc.fileName);
  let mainAssetsXml = editorFormats.isAssetsXml(doc) ? anno.getAssetsXmlPath(modPath) : doc.fileName;
  if (!mainAssetsXml || !modPath) {
    modPath = path.dirname(doc.fileName);
    mainAssetsXml = doc.fileName;
  }

  const version = anno.ModInfo.readVersion(modPath);
  const modsFolder: string | undefined = editor.getModsFolder({ filePath: doc.uri.fsPath, version });
  const config = vscode.workspace.getConfiguration('anno', doc.uri);
  const warningThreshold: number = config.get('liveModopAnalysis.warningThreshold') ?? 0;
  const editingFile = path.relative(modPath, doc.fileName);

  if (!editor.hasGamePath({ uri: doc.uri, version })) {
    const diagnostic = new vscode.Diagnostic(doc.lineAt(0).range,
      `Path \`anno.${editor.getGamePathSetting({ uri: doc.uri, version })}\` is not configured. Please check your settings.`,
      vscode.DiagnosticSeverity.Warning);
    diagnostic.code = GAME_PATH_117;
    diagnostic.source = 'anno';
    result.push(diagnostic);
    return [];
  }

  const vanillaXml = rda.getPatchTarget(mainAssetsXml, version, modPath);
  if (!vanillaXml || !fs.existsSync(vanillaXml)) {
    const diagnostic = new vscode.Diagnostic(doc.lineAt(0).range,
      `Patch target not found. Please check your gamePath / rdaFolder settings and content.\n${vanillaXml}`,
      vscode.DiagnosticSeverity.Warning);
    diagnostic.code = GAME_PATH_117;
    diagnostic.source = 'anno';
    result.push(diagnostic);
    return [];
  }

  const issues = xmltest.fetchIssues(vanillaXml, modPath, mainAssetsXml, editingFile,
    doc.getText(), modsFolder);
  if (issues && issues.length > 0) {
    const color = new vscode.ThemeColor('editorCodeLens.foreground');
    const colorWarning = new vscode.ThemeColor('editorWarning.foreground');

    for (const issue of issues.reverse()) {
      const line = doc.lineAt(issue.line);
      const range = new vscode.Range(
        line.range.start.translate(0, line.text.length - line.text.trimLeft().length),
        line.range.end.translate(0, -(line.text.length - line.text.trimRight().length))
      );

      if (issue.time !== undefined && !(issue.modOpType === 'Asset' && issue.time === 0)) {
        const decoration: vscode.DecorationOptions = {
          range,
          renderOptions: {
            after: {
              contentText: ` ${issue.time}ms`,
              color: (warningThreshold && issue?.time >= warningThreshold && issue.modOpType !== 'Group') ? colorWarning : color
            }
          }
        };
        decorations.push(decoration);
      }
      if (issue.time === undefined) {
        var warning: boolean = issue.message.startsWith('No matching node');
        warning ||= issue.message.startsWith('Content \"');

        const diagnostic = new vscode.Diagnostic(range, issue.message,
          warning ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error);
        diagnostic.source = 'anno';
        result.push(diagnostic);
      }
    }
  }

  return decorations;
}

function checkDiagnosticIssue(textLine: string, lineIndex: number, issue: IIssueDescription) {

  if (issue.matchWord && utils.findWord(textLine, issue.matchWord)) {
    const index = textLine.indexOf(issue.matchWord);
    const range = new vscode.Range(lineIndex, index, lineIndex, index + issue.matchWord.length);
    const diagnostic = new vscode.Diagnostic(range, issue.message, vscode.DiagnosticSeverity.Error);
    diagnostic.code = issue.code;
    diagnostic.source = 'anno';
    return diagnostic;
  }
  else if (issue.matchRegex) {
    const match = textLine.match(new RegExp(issue.matchRegex));
    if (match && match.index) {
      const index = match.index;
      const range = new vscode.Range(lineIndex, index, lineIndex, index + match[0].length);
      const diagnostic = new vscode.Diagnostic(range, issue.message, vscode.DiagnosticSeverity.Error);
      diagnostic.code = issue.code;
      diagnostic.source = 'anno';
      return diagnostic;
    }
  }

  return undefined;
}
