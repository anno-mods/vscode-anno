import * as vscode from 'vscode';

import * as decorations from './decorations';
import * as diagnostics from './diagnostics';

export function activate(context: vscode.ExtensionContext) {
  let timeout: NodeJS.Timer | undefined = undefined;
  let activeEditor = vscode.window.activeTextEditor;

  function updateAssetDecorations() {
    if (!activeEditor) {
      return;
    }

    decorations.refresh(activeEditor);
    diagnostics.refresh(context, activeEditor.document, false);
  }

  function updateAssetAndPerformanceDecorations() {
    if (!activeEditor) {
      return;
    }

    decorations.refresh(activeEditor);
    diagnostics.refresh(context, activeEditor.document);
  }

  function clearPerformanceDecorations() {
    if (!activeEditor) {
      return;
    }
    diagnostics.clear(activeEditor.document.uri, true);
  }

  function triggerUpdateDecorations(throttle = false, performance = false) {
    if (timeout) {
      clearTimeout(timeout);
      timeout = undefined;
    }
    if (throttle) {
      timeout = setTimeout(performance ? updateAssetAndPerformanceDecorations : updateAssetDecorations,
        2000 /* ms */);
    } else if (performance) {
      timeout = setTimeout(updateAssetAndPerformanceDecorations,
        100 /* ms */);
    }
    else {
      updateAssetDecorations();
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

  vscode.workspace.onDidRenameFiles(async (event) => {
    for (const { oldUri, newUri } of event.files) {
      diagnostics.clear(oldUri, false);
    }
  }, null, context.subscriptions);

  vscode.workspace.onDidDeleteFiles(async (event) => {
    for (const uri of event.files) {
      diagnostics.clear(uri, false);
    }
  })
}
