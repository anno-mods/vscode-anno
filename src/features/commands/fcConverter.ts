import * as vscode from 'vscode';
import * as child from 'child_process';

import * as channel from '../channel';
import * as fsutils from '../../other/fsutils';

/*
uses AnnoFCConverter from https://github.com/taubenangriff/AnnoFCConverter/
*/

export class FcConverter {
	public static register(context: vscode.ExtensionContext): vscode.Disposable[] {
    const converterPath = context.asAbsolutePath("./external/AnnoFCConverter.exe");

    const disposable = [
      vscode.commands.registerCommand('anno-modding-tools.convertFcCf7', (fileUri) => {
        if (fileUri) {
          const res = child.execFileSync(converterPath, [
            '-r', fileUri.fsPath,
            '-o', fsutils.dontOverwrite(fsutils.swapExtension(fileUri.fsPath, '.cf7'), '.cf7')
          ]);
          channel.log(res.toString());
        }
      }),
      vscode.commands.registerCommand('anno-modding-tools.convertCf7Fc', (fileUri) => {
        if (fileUri) {
          const res = child.execFileSync(converterPath, [
            '-w', fileUri.fsPath,
            '-o', fsutils.dontOverwrite(fsutils.swapExtension(fileUri.fsPath, '.fc'), '.fc')
          ]);
          channel.log(res.toString());
        }
      })
    ];

    return disposable;
	}
}