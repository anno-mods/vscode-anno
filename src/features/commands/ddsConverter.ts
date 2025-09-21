import * as vscode from 'vscode';

import * as dds from '../../tools/dds';
import * as fsutils from '../../other/fsutils';

export class DdsConverter {
	public static register(context: vscode.ExtensionContext): vscode.Disposable[] {
    const disposable = [
      vscode.commands.registerCommand('anno-modding-tools.pngToDds', (fileUri) => {
        if (fileUri) {
          fsutils.dontOverwriteFolder(fileUri.fsPath, '.dds', (source, targetFolder) => {
            dds.convertToTexture(source, targetFolder);
          });
        }
      }),
      vscode.commands.registerCommand('anno-modding-tools.ddsToPng', (fileUri) => {
        if (fileUri) {
          fsutils.dontOverwriteFolder(fileUri.fsPath, '.png', (source, targetFolder) => {
            dds.convertToImage(source, targetFolder);
          });
        }
      })
    ];

    return disposable;
	}
}