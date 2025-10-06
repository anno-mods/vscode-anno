import * as path from 'path';
import * as vscode from 'vscode';

import * as anno from '../../anno';

export function checkFilePaths(doc: vscode.TextDocument, version: anno.GameVersion) {
  const diagnostics: vscode.Diagnostic[] = [];
  const filePath = path.normalize(doc.fileName);

  if (version === anno.GameVersion.Anno8) {
    if (filePath.indexOf('data\\config\\gui\\texts_') >= 0) {
      diagnostics.push(new vscode.Diagnostic(doc.lineAt(0).range,
        `This is an Anno 1800 file path. Expected 'data/base/config/gui' as the folder for texts.`,
        vscode.DiagnosticSeverity.Error));
    }
    else if (filePath.endsWith('data\\config\\export\\main\\asset\\assets.xml')) {
      diagnostics.push(new vscode.Diagnostic(doc.lineAt(0).range,
        `This is an Anno 1800 file path. Expected 'data/base/config/export/assets.xml' as the file path.`,
        vscode.DiagnosticSeverity.Error));
    }
    else {
      const basename = path.basename(filePath);
      if (basename === 'assets.xml') {
        if (!filePath.endsWith('data\\base\\config\\export\\assets.xml')) {
          diagnostics.push(new vscode.Diagnostic(doc.lineAt(0).range,
            `Incorrect path for 'assets.xml'. Expected 'data/base/config/export/assets.xml' as the file path.`,
            vscode.DiagnosticSeverity.Error));
        }
      }
      else if (basename.startsWith('texts_') && basename.endsWith('.xml')) {
        if (!path.dirname(filePath).endsWith('data\\base\\config\\gui')) {
          diagnostics.push(new vscode.Diagnostic(doc.lineAt(0).range,
            `Incorrect path for '${basename}'. Expected 'data/base/config/gui/${basename}' as the file path.`,
            vscode.DiagnosticSeverity.Error));
        }
      }
    }
  }
  else if (version === anno.GameVersion.Anno7) {
    const basename = path.basename(filePath);
    if (basename === 'assets.xml') {
      if (!filePath.endsWith('data\\config\\export\\main\\asset\\assets.xml')) {
        diagnostics.push(new vscode.Diagnostic(doc.lineAt(0).range,
          `Incorrect path for 'assets.xml'. Expected 'data/config/export/main/asset/assets.xml' as the file path.`,
          vscode.DiagnosticSeverity.Error));
      }
    }
    else if (basename.startsWith('texts_') && basename.endsWith('.xml')) {
      if (!path.dirname(filePath).endsWith('data\\config\\gui')) {
        diagnostics.push(new vscode.Diagnostic(doc.lineAt(0).range,
          `Incorrect path for '${basename}'. Expected 'data/config/gui/${basename}' as the file path.`,
          vscode.DiagnosticSeverity.Error));
      }
    }
  }

  return diagnostics;
}
