import * as path from 'path';
import * as vscode from 'vscode';

import * as anno from '../anno';
import * as logger from '../utils/logger';

export class ModContext {
  public document?: vscode.TextDocument;
  public modinfo?: anno.ModInfo;
  public version: anno.GameVersion = anno.GameVersion.Auto;

  public constructor(document: vscode.TextDocument | undefined, version?: anno.GameVersion, modInfo?: anno.ModInfo) {
    this.document = document;
    if (version && modInfo) {
      this.version = version;
      this.modinfo = modInfo;
    }
    else if (modInfo) {
      this.version = modInfo.game;
      this.modinfo = modInfo;
    }
    else if (version) {
      this.version = version;
    }
    else if (document?.uri.scheme === 'file' &&  document?.uri.fsPath) {
      this.modinfo = anno.ModInfo.read(anno.findModRoot(document?.uri.fsPath), true);
      if (this.modinfo?.game) {
        this.version = this.modinfo.game;
      }
    }
  }
}

export function activate(context: vscode.ExtensionContext) {
  vscode.window.onDidChangeActiveTextEditor(editor => {
    try {
      if (!editor) {
        // keep version stable until a document is opened
        // this avoids flickering when switching between documents
        _current = new ModContext(undefined, _current.version);
      }
      else {
        let newContext: ModContext | undefined;
        for (let listener of _onCheckTextEditorContext) {
          newContext = listener(editor);
          if (newContext) {
            break;
          }
        }

        newContext ??= new ModContext(editor.document);

        // keep version stable
        if (newContext.version === anno.GameVersion.Auto) {
          newContext.version === _current.version;
        }

        _current = newContext;
      }

      for (let listener of _onDidChangeActiveTextEditor) {
        listener(_current);
      }
    }
    catch (error) {
      logger.error(`Exception during modContext.onDidChangeActiveTextEditor: ` + error);
      const callstack = (error as Error)?.stack;
      if (callstack) {
        logger.error(callstack);
      }
    }
  });

  vscode.workspace.onDidSaveTextDocument(document => {
    if ((document.languageId === 'json' || document.languageId === 'jsonc')
        && anno.isModinfoFile(document.fileName)) {
      _current = new ModContext(document);
      for (let listener of _onDidChangeActiveTextEditor) {
        listener(_current);
      }
    }
  });

  // TODO search all modinfos (stop at first multiple)

  // TODO listen to workspace changes, again search all modinfos (stop at first multiple)

  // TODO save context

  // TODO update workspace version on modinfo.json save
}

let _current: ModContext;
export function get() {
  if (!_current) {
    _current = new ModContext(vscode.window.activeTextEditor?.document);
  }

  return _current;
}

export function getVersion() {
  if (!_current) {
    get();
  }
  return _current.version;
}

let _workspaceVersion: anno.GameVersion | undefined;
export function getWorkspaceVersion() {
  return _workspaceVersion;
}

type ModEditorEvent = (e: ModContext) => any;
let _onDidChangeActiveTextEditor: ModEditorEvent[] = []
export function onDidChangeActiveTextEditor(listener: ModEditorEvent) {
  _onDidChangeActiveTextEditor.push(listener);
}

type CheckContextEvent = (e: vscode.TextEditor) => ModContext | undefined;
let _onCheckTextEditorContext: CheckContextEvent[] = []
export function onCheckTextEditorContext(listener: CheckContextEvent) {
  _onCheckTextEditorContext.push(listener);
}
