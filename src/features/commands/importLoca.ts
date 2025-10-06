import * as vscode from 'vscode';
import * as channel from '../channel';
import * as glob from 'glob';
import * as path from 'path';
import { Loca } from '../../editor/loca';

export class ImportLoca {
	public static register(context: vscode.ExtensionContext): vscode.Disposable[] {
    const disposable = [
      vscode.commands.registerCommand('anno-modding-tools.importLoca', async (fileUri) => {
        const language = await vscode.window.showQuickPick(Loca.LANGUAGES, {
          title: 'Which language to import?',
          placeHolder: 'Pick a language'
        });

        if (!language) {
          return;
        }

        const options: vscode.OpenDialogOptions = {
            canSelectMany: false,
            openLabel: 'Select folder with translation XMLs',
            canSelectFiles: false,
            canSelectFolders: true
        };

        vscode.window.showOpenDialog(options).then(fileUri => {
          if (fileUri && fileUri[0]) {
            ImportLoca.importLocaFromFolder(language, fileUri[0].fsPath, vscode.workspace.workspaceFolders?.map(e => e.uri.fsPath));
          }
        });
      })
    ];

    return disposable;
	}

  private static importLocaFromFolder(language: string, folder: string, workspaceFolders?: string[]) {
    if (!workspaceFolders || workspaceFolders.length == 0) {
      channel.error(`Translation import only works with workspaces`);
      return;
    }

    channel.log(`import translations from folder: ${folder}`);

    const allTexts: Loca.Texts = {};

    const xmls = glob.sync(`**/texts_${language}.xml`, { cwd: folder, nodir: true });
    for (var xmlFilePath of xmls) {
      channel.log(`read ${xmlFilePath}`);
      Loca.readTextsFromFile(path.join(folder, xmlFilePath), allTexts);
    }

    for (var workspaceFolder of workspaceFolders) {
      const targetXmls = glob.sync(`**/texts_${language}.xml`, { cwd: workspaceFolder, nodir: true });
      for (var targetFilePath of targetXmls) {
        const count = Loca.importTexts(path.join(workspaceFolder, targetFilePath), path.join(workspaceFolder, targetFilePath), allTexts);
        channel.log(`${count} entries changed: ${targetFilePath}`);
      }
    }
  }
}
