import * as vscode from 'vscode';

import * as decorations from './decorations';
import * as diagnostics from './diagnostics';
import * as life from './diagnostics/life';
import * as editorFormats from '../../editor/formats';

export function activate(context: vscode.ExtensionContext) {
  var staticTimeout: NodeJS.Timer | undefined = undefined;
  var lifeTimeout: NodeJS.Timer | undefined = undefined;
  var activeEditor = vscode.window.activeTextEditor;

  function staticScan() {
    if (activeEditor) {
      decorations.refresh(activeEditor);
      diagnostics.refresh(context, activeEditor.document);
    }
  }

  function dynamicScan() {
    if (activeEditor) {
      life.refresh(context, activeEditor.document);
    }
  }

  function triggerDynamicScan() {
    if (!activeEditor || !editorFormats.allowLiveValidation(activeEditor.document)) {
      return;
    }

    if (lifeTimeout) {
      clearTimeout(lifeTimeout);
      lifeTimeout = undefined;
    }
    lifeTimeout = setTimeout(dynamicScan, 500 /* ms */);
  }

  function triggerStaticScan(throttle = false) {
    if (staticTimeout) {
      clearTimeout(staticTimeout);
      staticTimeout = undefined;
    }
    if (throttle) {
      staticTimeout = setTimeout(staticScan, 100 /* ms */);
    }
    else {
      staticScan();
    }
  }

  if (activeEditor) {
    triggerStaticScan(true);
    triggerDynamicScan();
  }

  vscode.window.onDidChangeActiveTextEditor(editor => {
    activeEditor = editor;
    if (editor) {
      life.clear(editor.document.uri);
      diagnostics.clear(editor.document.uri);
      triggerStaticScan(false);
      triggerDynamicScan();
    }
  }, null, context.subscriptions);

  vscode.workspace.onDidChangeTextDocument(async (event) => {
    if (activeEditor && event.document === activeEditor.document) {
      life.clear(activeEditor.document.uri);
      triggerStaticScan(true);
    }
  }, null, context.subscriptions);

  vscode.workspace.onDidSaveTextDocument(async (event) => {
    if (activeEditor) {
      triggerStaticScan(false);
      triggerDynamicScan();
    }
  }, null, context.subscriptions);

  vscode.workspace.onDidRenameFiles(async (event) => {
    for (const { oldUri, newUri } of event.files) {
      life.clear(oldUri);
      diagnostics.clear(oldUri);
    }
  }, null, context.subscriptions);

  vscode.workspace.onDidDeleteFiles(async (event) => {
    for (const uri of event.files) {
      life.clear(uri);
      diagnostics.clear(uri);
    }
  })
}
