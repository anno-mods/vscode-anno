import * as vscode from 'vscode';
import * as path from 'path';
import * as glob from 'glob';

import * as channel from '../channel';
import * as anno from '../../anno';
import { ModBuilder } from '../../builder';
import * as editor from '../../editor';

export class DeployCommand {
  context: vscode.ExtensionContext;

	public static register(context: vscode.ExtensionContext): vscode.Disposable[] {
    const disposable = [
      vscode.commands.registerCommand('anno-modding-tools.buildMod', async (fileUri) => {
        if (!editor.ensureModsFolder(fileUri)) {
          return;
        }

        await DeployCommand._commandCompileMod(fileUri?.fsPath, context);
      }),
    ];

    return disposable;
	}

  private constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  public static async _commandCompileMod(filePath: string | undefined, context: vscode.ExtensionContext) {
    let mods;
    if (filePath) {
      mods = [ { label: path.basename(filePath), detail: filePath } ];
    }
    else {
      mods = DeployCommand._findMods();
      if (mods.length === 0) {
        vscode.window.showWarningMessage('No \'modinfo.json\' found in workspace to build.');
        return;
      }
    }

    const selectedMods = [];
    if (mods.length > 1) {
      const result = await vscode.window.showQuickPick([{ label: 'All' }, ...mods], {
          title: 'Which mod do you want to deploy?',
          placeHolder: 'Pick a mod'
        });
      if (!result) {
        return;
      }
      if (!result.detail) { // item 'All' has no detail
        selectedMods.push(...mods);
      }
      else {
        selectedMods.push(result);
      }
    }
    else {
      selectedMods.push(mods[0]);
    }

    channel.show();

    for (const mod of selectedMods) {
      if (!mod.detail) {
        // shouldn't happen
        continue;
      }

      const annoMods = editor.getModsFolder({ filePath: mod.detail, version: anno.ModInfo.readVersion(mod.detail) });
      if (!annoMods) {
        // shouldn't happen, we ensured before
        continue;
      }
      // TODO gamePath doesn't support this (yet), we need errors later on
      const config = vscode.workspace.getConfiguration('anno');
      const annoRda: string = config.get('rdaFolder') || "";

      const builder = new ModBuilder(channel, context.asAbsolutePath, { annoMods, annoRda });

      if (!await builder.build(mod.detail as string)) {
        console.error('building mods failed');
        break;
      }
    }
  }

  private static _findMods() {
    let mods: vscode.QuickPickItem[] = [];
    const workspaces = vscode.workspace.workspaceFolders?.map(folder => folder.uri.fsPath) || [];
    for (const folder of workspaces) {
      mods.push(...(glob.sync('**/modinfo.{json,jsonc}', { cwd: folder, nodir: true }).map((e) => ({
        detail: path.join(folder, e),
        label: path.dirname(e)
      }))));
    }

    mods = mods.filter(e => !e.label.startsWith('out/') && !e.label.startsWith('out\\'));
    return mods;
  }
}
