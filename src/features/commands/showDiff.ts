import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import * as channel from '../channel';
import * as anno from '../../anno';
import * as rda from '../../data/rda';
import * as editor from '../../editor';
import * as modContext from '../../editor/modContext';
import * as text from '../../editor/text';
import * as xmltest from '../../tools/xmltest';

class DiffRequest {
  originalPath: string;
  patchPath?: string;
  patch?: string;

  modInfo?: anno.ModInfo;

  originalContent?: string;
  patchedContent?: string;

  public constructor(originalPath: string, modInfo?: anno.ModInfo) {
    this.originalPath = originalPath;
    this.modInfo = modInfo;
  }

  public load() {
    if (!this.patchPath) {
      // unexpected
      return;
    }

    if (!this.originalContent) {
      const modPath = anno.searchModPath(this.patchPath);
      const modsFolder = editor.getModsFolder({ filePath: this.patchPath, version: this.modInfo?.game })

      const result = this.diff(this.originalPath,
        this.patch ? ('<ModOps>' + this.patch + '</ModOps>') : fs.readFileSync(this.patchPath, 'utf-8'),
        this.patchPath,
        modPath,
        modsFolder);
      this.originalContent = result.original;
      this.patchedContent = result.patched;

      channel.log(result.log);
    }
  }

  diff(originalPath: string, patchContent: string, patchFilePath: string, modPath: string, modsFolder?: string) {
    return xmltest.diff(originalPath, patchContent, patchFilePath, modPath, modsFolder);
  }


  static readonly _requests = new Map<string, DiffRequest>();

  public static add(timestamp: string, request: DiffRequest) {
    DiffRequest._requests.set(timestamp, request);
  }

  public static get(timestamp: string) {
    if (!timestamp) {
      return undefined;
    }

    return DiffRequest._requests.get(timestamp);
  }

  public static remove(timestamp: string) {
    DiffRequest._requests.delete(timestamp);
  }
}

export class ShowDiffCommand {
	public static register(context: vscode.ExtensionContext): vscode.Disposable[] {
    const annodiffContentProvider = new (class implements vscode.TextDocumentContentProvider {
      provideTextDocumentContent(uri: vscode.Uri): string {

        const request = DiffRequest.get(uri.fragment);
        if (!request) {
          channel.errorThrow(`Failed to diff '${uri.fsPath}'`);
        }

        request.load();

        if (!request.originalContent || !request.patchedContent) {
          channel.errorThrow(`Failed to diff '${request.patchPath}'`);
        }

        if (uri.query === 'original') {
          return request.originalContent;
        }
        else {
          return request.patchedContent;
        }
      }
    })();

    const disposable = [
      vscode.commands.registerCommand('anno-modding-tools.showFileDiff', ShowDiffCommand.showFileDiff),
      vscode.commands.registerCommand('anno-modding-tools.showModDiff', ShowDiffCommand.showFileDiff),
      vscode.commands.registerCommand('anno-modding-tools.showSelectionDiff', ShowDiffCommand.showSelectionDiff),
      vscode.workspace.registerTextDocumentContentProvider("annodiff", annodiffContentProvider)
    ];

    modContext.onCheckTextEditorContext(editor => {
      const uri = editor.document.uri;
      if (uri.scheme.startsWith('annodiff')) {
        const modInfo = DiffRequest.get(uri.fragment)?.modInfo;

        // TODO after 1800 supports anno-xml
        // vscode.languages.setTextDocumentLanguage(editor.document, 'anno-xml');
        return new modContext.ModContext(editor?.document, modInfo?.game, modInfo);
      }
    });

    vscode.workspace.onDidCloseTextDocument(editor => {
      DiffRequest.remove(editor.uri.fragment);
    });

    return disposable;
	}

  static async showFileDiff(fileUri: any) {
    const request = await ShowDiffCommand.gatherPaths(fileUri);
    if (!request) {
      return;
    }

    let patchFilePath = fileUri.fsPath;
    if (path.basename(patchFilePath) === 'modinfo.json') {
      patchFilePath = anno.getAssetsXmlPath(path.dirname(patchFilePath), request.modInfo?.game ?? anno.GameVersion.Anno7);
    }

    if (!fs.existsSync(patchFilePath)) {
      vscode.window.showWarningMessage(`No assets.xml to compare.\n\nThere is no file at: '${patchFilePath}'`);
      return;
    }

    request.patchPath = patchFilePath;
    request.patch = "";

    ShowDiffCommand.executeDiff(request);
  }

  static async showSelectionDiff(fileUri: any) {
    const textEditor = vscode.window.activeTextEditor;
    if (!textEditor) {
      return;
    }

    const request = await ShowDiffCommand.gatherPaths(fileUri);
    if (!request) {
      return;
    }

    request.patchPath = fileUri.fsPath;
    request.patch = text.getSelectedModOps(textEditor.document, textEditor.selection);
    request.patch = request.patch.replace(/<\/?ModOps>/g, '');

    ShowDiffCommand.executeDiff(request);
  }

  static async gatherPaths(fileUri: vscode.Uri): Promise<DiffRequest | undefined> {
    const textEditor = vscode.window.activeTextEditor;
    if (!textEditor) {
      return undefined;
    }

    const modPath = anno.findModRoot(fileUri.fsPath);
    const modInfo = anno.ModInfo.read(modPath);

    if (!editor.ensureGamePath({ version: modInfo?.game, filePath: fileUri.fsPath } )) {
      return undefined;
    }

    const version = modInfo?.game ?? anno.GameVersion.Anno7;

    const vanillaAssetsFilePath = rda.getPatchTarget(fileUri.fsPath, version);
    if (!vanillaAssetsFilePath) {
      vscode.window.showWarningMessage(`Unknown target: '${fileUri.fsPath}' (${anno.gameVersionName(version)})`);
      return undefined;
    }
    if (!fs.existsSync(vanillaAssetsFilePath)) {
      vscode.window.showWarningMessage(`Can't find target: '${vanillaAssetsFilePath}' (${anno.gameVersionName(version)})`);
      return undefined;
    }

    return new DiffRequest(vanillaAssetsFilePath, modInfo);
  }

  static executeDiff(request: DiffRequest) {
    const timestamp = Date.now();
    DiffRequest.add(timestamp.toString(), request);

    channel.show();

    vscode.commands.executeCommand('vscode.diff',
      vscode.Uri.parse('annodiff:' + request.originalPath + '?original#' + timestamp),
      vscode.Uri.parse('annodiff:' + request.patchPath + '?patch#' + timestamp),
      'Original ↔ Patched');
  }
}