import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import { SymbolRegistry } from '../../data/symbols';
import * as editorFormats from '../../editor/formats';
import * as utils from '../../other/utils';
import { assetNameWithOrigin } from '../../other/assetsXml';

import { clearDiagnostics, diagnostics, refreshDiagnostics } from './assetsActionProvider';

// this method is called when vs code is activated
export function activate(context: vscode.ExtensionContext) {
  const assetPath = context.asAbsolutePath('./generated/');
  const allowedTags = JSON.parse(
      fs.readFileSync(assetPath + 'guids.json', { encoding: 'utf8' })) as { [index: string]: any };

  let timeout: NodeJS.Timer | undefined = undefined;

  const guidDecorationType = vscode.window.createTextEditorDecorationType({});
  const assetDecorationType = vscode.window.createTextEditorDecorationType({});

  let activeEditor = vscode.window.activeTextEditor;

  function decorationText(tag: string, guid: string, mod?: string) {
    const tagInfo = allowedTags[tag];
    if (tag !== 'BaseAssetGUID'
      && tag !== 'BonusNeed'
      && (!tagInfo
        || tagInfo.templates.length === 0
        || tag.endsWith('Amount')
        || tag === 'BuildModeRandomRotation')) {
      return '';
    }

    if (guid === '0') {
      return '(no target)';
    }
    else if (guid === '-1') {
      return '(not set)';
    }

    return assetNameWithOrigin(SymbolRegistry.resolve(guid), mod);
  }

  function updateDecorations() {
    if (!activeEditor || !editorFormats.isAnnoXml(activeEditor.document)) {
      return;
    }

    const modName = path.basename(utils.searchModPath(activeEditor.document.uri.fsPath));

    const traverse = (activeEditor: vscode.TextEditor, color: string,
      regex: RegExp, onMatch: (match: RegExpExecArray) => string,
      type: vscode.TextEditorDecorationType) => {

      if (!editorFormats.isAnnoXml(activeEditor.document)) {
        return;
      }

      const text = activeEditor.document.getText();
      const guids: vscode.DecorationOptions[] = [];
      let match;
      while ((match = regex.exec(text))) {
        const startPos = activeEditor.document.positionAt(match.index);
        const endPos = activeEditor.document.positionAt(match.index + match[0].length);

        const text = onMatch(match);
        if (!text) {
          continue;
        }

        const decoration: vscode.DecorationOptions = {
          range: new vscode.Range(startPos, endPos),
          renderOptions: {
            after: {
              contentText: text,
              color: new vscode.ThemeColor(color),
              margin: '15px'
            }
          }
        };
        guids.push(decoration);
      }

      activeEditor.setDecorations(type, guids);
    };

    // Decorate GUID numbers with name, template and origin (if applicable)
    let withinStandard = false;
    traverse(activeEditor, 'editorCodeLens.foreground', /(<\/?Standard>)|<(\w+)>(\d+)<\/\2>/g, (match) => {
      if (match[1] === '<Standard>') {
        withinStandard = true;
      }
      else if (match[1] === '</Standard>') {
        withinStandard = false;
      }
      else if (!withinStandard || (match[2] !== 'GUID' && match[2] !== 'Name')) {
        return decorationText(match[2], match[3], modName);
      }

      return '';
    }, guidDecorationType);

    // Decorate top-level <Asset>s with name and template
    traverse(activeEditor, 'editorCodeLens.foreground', /<Asset>/g, (match) => {
      const doc = activeEditor?.document;
      if (!doc) {
        return '';
      }

      const startPos = doc.positionAt(match.index);
      let standard = doc.getText(new vscode.Range(startPos.line, startPos.character, startPos.line + 20, 0));
      const endPos = standard.indexOf('</Asset>');
      if (endPos >= 0) {
        standard = standard.substring(0, endPos);
      }
      const guidRegex = /<GUID>(\d+)<\/GUID>/g;
      let guidMatch = guidRegex.exec(standard);
      if (!guidMatch) {
        return '';
      }
      return decorationText('GUID', guidMatch[1]);
    }, assetDecorationType);
  }

  function updateAssetAndPerformanceDecorations() {
    if (!activeEditor) {
      return;
    }

    updateDecorations();
    refreshDiagnostics(context, activeEditor.document, diagnostics);
  }

  function clearPerformanceDecorations() {
    if (!activeEditor) {
      return;
    }
    clearDiagnostics(context, activeEditor.document, diagnostics);
  }

  function triggerUpdateDecorations(throttle = false, performance = false) {
    if (timeout) {
      clearTimeout(timeout);
      timeout = undefined;
    }
    if (throttle) {
      timeout = setTimeout(performance ? updateAssetAndPerformanceDecorations : updateDecorations,
        2000 /* ms */);
    } else if (performance) {
      timeout = setTimeout(updateAssetAndPerformanceDecorations,
        100 /* ms */);
    }
    else {
      updateDecorations();
    }
  }

  if (activeEditor) {
    triggerUpdateDecorations(true, true);
  }

  vscode.window.onDidChangeActiveTextEditor(editor => {
    activeEditor = editor;
    if (editor) {
      clearPerformanceDecorations();
      triggerUpdateDecorations(false, true);
    }
  }, null, context.subscriptions);

  vscode.workspace.onDidChangeTextDocument(async (event) => {
    if (activeEditor && event.document === activeEditor.document) {
      clearPerformanceDecorations();
      triggerUpdateDecorations(true, false);
    }
  }, null, context.subscriptions);

  vscode.workspace.onDidSaveTextDocument(async (event) => {
    if (activeEditor) {
      triggerUpdateDecorations(false, true);
    }
  }, null, context.subscriptions);
}
