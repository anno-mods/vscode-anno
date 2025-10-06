import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import * as anno from '../../../anno';
import * as rda from '../../../data/rda';
import * as editor from '../../../editor';
import * as xmltest from '../../../tools/xmltest';
import * as editorFormats from '../../../editor/formats';

export const GAME_PATH_117 = 'anno.117.gamePath';

const performanceDecorationType = vscode.window.createTextEditorDecorationType({});
export const diagnosticsCollection = vscode.languages.createDiagnosticCollection('anno-life');

export function clear(uri: vscode.Uri) {
  vscode.window.activeTextEditor?.setDecorations(performanceDecorationType, []);
  diagnosticsCollection.delete(uri);
}

export function refresh(context: vscode.ExtensionContext, doc: vscode.TextDocument) {
  const result: vscode.Diagnostic[] = [];
  const performance = runXmlTest(context, doc, result);

  if (vscode.window.activeTextEditor?.document === doc) {
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
