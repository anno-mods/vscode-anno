import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import * as diagnostics from './diagnostics';
import * as versionChecks from './versionChecks';
import * as anno from '../../anno';
import * as rda from '../../data/rda';
import * as editor from '../../editor';
import * as utils from '../../utils';
import { ASSETS_FILENAME_PATTERN } from '../../utils/assetsXml';
import * as xmltest from '../../tools/xmltest';
import * as editorFormats from '../../editor/formats';

const GAME_PATH_117 = 'anno.117.gamePath';

export const diagnosticsCollection = vscode.languages.createDiagnosticCollection("assets-xml");
const performanceDecorationType = vscode.window.createTextEditorDecorationType({});

export class AssetsActionProvider {
  public static register(context: vscode.ExtensionContext): vscode.Disposable[] {
    // subscribeToDocumentChanges(context, diagnostics);

    const selector: vscode.DocumentSelector = [
      { language: 'anno-xml', scheme: 'file' },
      { language: 'xml', scheme: 'file', pattern: ASSETS_FILENAME_PATTERN }
    ];
    return [
      diagnosticsCollection,
      vscode.languages.registerCodeActionsProvider(selector, new AssetsCodeActionProvider(), {
        providedCodeActionKinds: AssetsCodeActionProvider.providedCodeActionKinds
      })
    ];
  }
}

function checkFileName(modPaths: string[], line: vscode.TextLine, annoRda?: string) {
  const regEx = /<(Filename|FileName|IconFilename|RecipeImage|RecipeListMoodImage)>([^<]+)<\/\1>/g;
  let match = regEx.exec(line.text);
  let checked;
  if (match && (checked = anno.hasGraphicsFile(modPaths, match[2], annoRda)).length > 0) {
    const index = line.text.indexOf(match[2]);
    const range = new vscode.Range(line.lineNumber, index, line.lineNumber, index + match[2].length);

    const allPaths = annoRda ? [annoRda, ...modPaths] : modPaths;

    const diagnostic = new vscode.Diagnostic(range,
      `File seems to be missing.\nChecked paths:\n${allPaths.join('\n')}\nChecked patterns:\n${checked.join('\n')}`,
      vscode.DiagnosticSeverity.Warning);
    return diagnostic;
  }

  return undefined;
};

export function clearDiagnostics(doc: vscode.TextDocument, performanceOnly: boolean = false) {
  vscode.window.activeTextEditor?.setDecorations(performanceDecorationType, []);

  if (!performanceOnly) {
    diagnosticsCollection.delete(doc.uri)
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
  result.push(...versionChecks.checkCorrectVersion(doc, version));

  const issues = diagnostics.issues();
  for (let lineIndex = 0; lineIndex < doc.lineCount; lineIndex++) {
    const lineOfText = doc.lineAt(lineIndex);

    for (var issue of issues) {
      const detected = checkDiagnosticIssue(lineOfText.text, lineIndex, issue);
      if (detected) {
        result.push(detected);
      }
    }

    if (checkFileNames) {
      const fileAction = checkFileName(modPaths, lineOfText, annoRda);
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
    result.push(diagnostic);
    return [];
  }

  const vanillaXml = rda.getPatchTarget(mainAssetsXml, version, modPath);
  if (!vanillaXml || !fs.existsSync(vanillaXml)) {
    const diagnostic = new vscode.Diagnostic(doc.lineAt(0).range,
      `Patch target not found. Please check your gamePath / rdaFolder settings and content.\n${vanillaXml}`,
      vscode.DiagnosticSeverity.Warning);
    diagnostic.code = GAME_PATH_117;
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
        const diagnostic = new vscode.Diagnostic(range, issue.message,
          issue.time ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error);
        result.push(diagnostic);
      }
    }
  }

  return decorations;
}

function checkDiagnosticIssue(textLine: string, lineIndex: number, issue: diagnostics.IIssueDescription) {

  if (issue.matchWord && utils.findWord(textLine, issue.matchWord)) {
    const index = textLine.indexOf(issue.matchWord);
    const range = new vscode.Range(lineIndex, index, lineIndex, index + issue.matchWord.length);
    const diagnostic = new vscode.Diagnostic(range, issue.message, vscode.DiagnosticSeverity.Error);
    diagnostic.code = issue.code;
    return diagnostic;
  }
  else if (issue.matchRegex) {
    const match = textLine.match(new RegExp(issue.matchRegex));
    if (match && match.index) {
      const index = match.index;
      const range = new vscode.Range(lineIndex, index, lineIndex, index + match[0].length);
      const diagnostic = new vscode.Diagnostic(range, issue.message, vscode.DiagnosticSeverity.Error);
      diagnostic.code = issue.code;
      return diagnostic;
    }
  }

  return undefined;
}

export class AssetsCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix
  ];

  provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection, context: vscode.CodeActionContext, token: vscode.CancellationToken): vscode.CodeAction[] {
    return context.diagnostics
      .map(diagnostic => this.createCommandCodeAction(diagnostic, document))
      .filter(utils.removeNulls);
  }

  private createCommandCodeAction(diagnostic: vscode.Diagnostic, document: vscode.TextDocument): vscode.CodeAction | undefined {
    if (diagnostic.code === GAME_PATH_117) {
      const action = new vscode.CodeAction(`Open settings for \`${GAME_PATH_117}\``, vscode.CodeActionKind.QuickFix);
      action.command = {
        title: action.title,
        command: 'workbench.action.openSettings',
        arguments: [ GAME_PATH_117 ]
      };
      action.diagnostics = [diagnostic];
      action.isPreferred = true;
      return action;
    }
    else {
      const issues = diagnostics.issues();
      for (var issue of issues) {
        if (issue.fix !== undefined && diagnostic.code === issue.code) {
          const action = new vscode.CodeAction(issue.fixMessage || 'Fix it', vscode.CodeActionKind.QuickFix);
          action.edit = new vscode.WorkspaceEdit();

          if (issue.matchRegex && issue.fix.indexOf('\\1') >= 0) {
            // regex use detected
            var newText = issue.fix;
            const issueText = document.getText(diagnostic.range);
            const match = issueText.match(new RegExp(issue.matchRegex));
            if (match) {
              for (var i = 1; i < (match?.length ?? 0); i++) {
                newText = newText.replace('\\' + i, match[i]);
              }
            }
            action.edit.replace(document.uri, diagnostic.range, newText);
          }
          else {
            action.edit.replace(document.uri, diagnostic.range, issue.fix);
          }
          action.diagnostics = [diagnostic];
          action.isPreferred = true;
          return action;
        }
      }
    }

    return undefined;
  }
}