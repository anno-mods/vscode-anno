import * as vscode from 'vscode';
import * as path from 'path';
import { ASSETS_FILENAME_PATTERN } from '../other/assetsXml';
import * as editorUtils from '../editor/utils';
import * as utils from '../other/utils';
import * as xmltest from '../other/xmltest';
import * as logger from '../other/logger';
import * as editorFormats from '../editor/formats';

const DEPRECATED_ALL = '190611';
const DEPRECATED_ALL2 = '193879';
const DEPRECATED_ALL_FIX = '368';
const DEPRECATED_ALL_CODE = 'all_buildings_with_maintenance_DONTUSE';

export const diagnostics = vscode.languages.createDiagnosticCollection("assets-xml");
const performanceDecorationType = vscode.window.createTextEditorDecorationType({});

export class AssetsActionProvider {
  public static register(context: vscode.ExtensionContext): vscode.Disposable[] {
    // subscribeToDocumentChanges(context, diagnostics);

    const selector: vscode.DocumentSelector = { language: 'xml', scheme: '*', pattern: ASSETS_FILENAME_PATTERN };
    return [
      diagnostics,
      vscode.languages.registerCodeActionsProvider(selector, new AssetsCodeActionProvider(), {
        providedCodeActionKinds: AssetsCodeActionProvider.providedCodeActionKinds
      })
    ];
  }
}

function includesAsWord(line: string, text: string)
{
  const pos = line.indexOf(text);
  if (pos <= 0) {
    return false;
  }

  const charBefore = line.charAt(pos - 1);
  const charAfter = line.charAt(pos + text.length);

  return (charBefore === '\'' || charAfter === '\'' ||
    charBefore === '"' || charAfter === '"' ||
    charBefore === ',' && charAfter === ',');
}

function checkFileName(modPaths: string[], line: vscode.TextLine, annoRda?: string) {
  const regEx = /<(Filename|FileName|IconFilename|RecipeImage|RecipeListMoodImage)>([^<]+)<\/\1>/g;
  let match = regEx.exec(line.text);
  let checked;
  if (match && (checked = utils.hasGraphicsFile(modPaths, match[2], annoRda)).length > 0) {
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

export function clearDiagnostics(context: vscode.ExtensionContext, doc: vscode.TextDocument, collection: vscode.DiagnosticCollection) {
  vscode.window.activeTextEditor?.setDecorations(performanceDecorationType, []);
  diagnostics.delete(doc.uri)
}

export function refreshDiagnostics(context: vscode.ExtensionContext, doc: vscode.TextDocument, collection: vscode.DiagnosticCollection): void {
  if (!editorFormats.isPatchXml(doc)) {
    vscode.commands.executeCommand('setContext', 'anno-modding-tools.openPatchFile', false);
    return;
  }

  vscode.commands.executeCommand('setContext', 'anno-modding-tools.openPatchFile', true);

  const config = vscode.workspace.getConfiguration('anno', doc.uri);
  const checkFileNames = config.get('checkFileNames');
  const annoRda: string | undefined = config.get('rdaFolder');
  const modsFolder: string | undefined = config.get('modsFolder');

  const diagnostics: vscode.Diagnostic[] = [];

  const modPaths = utils.searchModPaths(doc.uri.fsPath, modsFolder);

  for (let lineIndex = 0; lineIndex < doc.lineCount; lineIndex++) {
    const lineOfText = doc.lineAt(lineIndex);
    if (includesAsWord(lineOfText.text, DEPRECATED_ALL)) {
      diagnostics.push(createDiagnostic(doc, lineOfText, lineIndex));
    }
    else if (includesAsWord(lineOfText.text, DEPRECATED_ALL2)) {
      diagnostics.push(createDiagnostic2(doc, lineOfText, lineIndex));
    }

    if (checkFileNames) {
      const fileAction = checkFileName(modPaths, lineOfText, annoRda);
      if (fileAction) {
        diagnostics.push(fileAction);
      }
    }
  }

  if (editorFormats.allowLiveValidation(doc)) {
    const performance = runXmlTest(context, doc, diagnostics);
    vscode.window.activeTextEditor?.setDecorations(performanceDecorationType, performance);
  }

  collection.set(doc.uri, diagnostics);
}

function runXmlTest(context: vscode.ExtensionContext, doc: vscode.TextDocument,
  result: vscode.Diagnostic[]): vscode.DecorationOptions[] {

  const decorations: vscode.DecorationOptions[] = [];

  let modPath = utils.findModRoot(doc.fileName);
  let mainAssetsXml = editorFormats.isAssetsXml(doc) ? utils.getAssetsXmlPath(modPath) : doc.fileName;
  if (!mainAssetsXml || !modPath) {
    modPath = path.dirname(doc.fileName);
    mainAssetsXml = doc.fileName;
  }

  const config = vscode.workspace.getConfiguration('anno', doc.uri);
  const modsFolder: string | undefined = config.get('modsFolder');
  const warningThreshold: number = config.get('liveModopAnalysis.warningThreshold') ?? 0;
  const editingFile = path.relative(modPath, doc.fileName);

  const vanilaXml = editorUtils.getVanilla(mainAssetsXml, modPath);
  if (!vanilaXml) {
    logger.error('vanila XML not found');
    return [];
  }

  const issues = xmltest.fetchIssues(vanilaXml, modPath, mainAssetsXml, editingFile,
    doc.getText(), modsFolder, x => context.asAbsolutePath(x));
  if (issues && issues.length > 0) {
    const color = new vscode.ThemeColor('editorCodeLens.foreground');
    const colorWarning = new vscode.ThemeColor('editorWarning.foreground');

    for (const issue of issues.reverse()) {
      const line = doc.lineAt(issue.line);
      const range = new vscode.Range(
        line.range.start.translate(0, line.text.length - line.text.trimLeft().length),
        line.range.end.translate(0, -(line.text.length - line.text.trimRight().length))
      );

      if (issue.time !== undefined) {
        const decoration: vscode.DecorationOptions = {
          range,
          renderOptions: {
            after: {
              contentText: ` ${issue.time}ms`,
              color: (warningThreshold && issue?.time >= warningThreshold && !issue.group) ? colorWarning : color
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

function createDiagnostic(doc: vscode.TextDocument, lineOfText: vscode.TextLine, lineIndex: number): vscode.Diagnostic {
  const index = lineOfText.text.indexOf(`${DEPRECATED_ALL}`);
  const range = new vscode.Range(lineIndex, index, lineIndex, index + DEPRECATED_ALL.length);

  const diagnostic = new vscode.Diagnostic(range,
    `\`${DEPRECATED_ALL}\` is deprecated and won't work with Captain of Industry properly. Use \`${DEPRECATED_ALL_FIX}\` instead.`,
    vscode.DiagnosticSeverity.Error);
  diagnostic.code = DEPRECATED_ALL_CODE;
  return diagnostic;
}

// TODO this is not how you do things 😆
function createDiagnostic2(doc: vscode.TextDocument, lineOfText: vscode.TextLine, lineIndex: number): vscode.Diagnostic {
  const index = lineOfText.text.indexOf(`${DEPRECATED_ALL2}`);
  const range = new vscode.Range(lineIndex, index, lineIndex, index + DEPRECATED_ALL2.length);

  const diagnostic = new vscode.Diagnostic(range,
    `\`${DEPRECATED_ALL2}\` is deprecated and won't work with Captain of Industry properly. Use \`${DEPRECATED_ALL_FIX}\` instead.`,
    vscode.DiagnosticSeverity.Error);
  diagnostic.code = DEPRECATED_ALL_CODE;
  return diagnostic;
}

export class AssetsCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix
  ];

  provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection, context: vscode.CodeActionContext, token: vscode.CancellationToken): vscode.CodeAction[] {
    return context.diagnostics
      .filter(diagnostic => diagnostic.code === DEPRECATED_ALL_CODE)
      .map(diagnostic => this.createCommandCodeAction(diagnostic, document.uri));
  }

  private createCommandCodeAction(diagnostic: vscode.Diagnostic, uri: vscode.Uri): vscode.CodeAction {
    const action = new vscode.CodeAction('Fix it', vscode.CodeActionKind.QuickFix);
    action.edit = new vscode.WorkspaceEdit();
    action.edit.replace(uri, diagnostic.range, DEPRECATED_ALL_FIX);
    action.diagnostics = [diagnostic];
    action.isPreferred = true;
    return action;
  }
}