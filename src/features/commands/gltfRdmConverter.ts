import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import * as channel from '../channel';
import * as fsutils from '../../generic/fsutils';
import { GltfConverter } from '../../builder/converter/gltf';

/*
uses rdm4-bin from https://github.com/lukts30/rdm4
*/

export class GltfRdmConverter {
	public static register(context: vscode.ExtensionContext): vscode.Disposable[] {
    const disposable = [
      vscode.commands.registerCommand('anno-modding-tools.convertGltfToRdm', async (fileUri) => {
        if (fileUri) {
          const cache = path.join(path.dirname(fileUri.fsPath), '.gtlfconvert');

          const converter = new GltfConverter();
          converter.init(channel, context.asAbsolutePath);
          await converter.run([ path.basename(fileUri.fsPath) ], path.dirname(fileUri.fsPath), path.dirname(fileUri.fsPath), {
            cache,
            converterOptions: {
              animPath: fsutils.swapExtension(path.basename(fileUri.fsPath), '') + '-anim/'
            }
          });

          fs.rmdirSync(cache, { recursive: true });
        }
      }),
    ];

    return disposable;
	}
}