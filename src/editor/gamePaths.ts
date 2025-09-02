import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import * as modContext from './modContext';
import * as anno from '../anno';

const ANNO8_SEARCH_PATHS = [
  `C:\\Program Files (x86)\\Ubisoft\\Ubisoft Game Launcher\\games\\Anno 117`,
  `C:\\Program Files (x86)\\Ubisoft\\Ubisoft Game Launcher\\games\\Anno 117 - Pax Romana - Demo`,
  `D:\\Program Files (x86)\\Ubisoft\\Ubisoft Game Launcher\\games\\Anno 117`,
  `D:\\Program Files (x86)\\Ubisoft\\Ubisoft Game Launcher\\games\\Anno 117 - Pax Romana - Demo`
]

export class GamePaths {
  public static activate(context: vscode.ExtensionContext): vscode.Disposable[] {
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('anno.117.gamePath')) {
        for (let listener of GamePaths._onDidChangeGamePath) {
          listener();
        }
      }
    });

    return [
      vscode.commands.registerCommand('anno-modding-tools.selectAnno117GamePath', GamePaths.selectGamePath),
      vscode.commands.registerCommand('anno-modding-tools.selectAnno117ModsFolder', GamePaths.selectModsFolder)
    ];
  }

  // events

  static _onDidChangeGamePath: (() => void)[] = []
  public static onDidChangeGamePath(listener: (() => void)) {
    GamePaths._onDidChangeGamePath.push(listener);
  }

  // modsFolder

  public static getModsFolder(options?: { filePath?: string, version?: anno.GameVersion }): string | undefined {
    const config = vscode.workspace.getConfiguration('anno');

    const version = options?.version ?? modContext.getVersion();

    if (version === anno.GameVersion.Anno8) {
      const gamePath = config.get<string>('117.gamePath');
      let modsFolder = config.get<string>('117.modsFolder');
      if (!modsFolder && gamePath && GamePaths.isValidGamePath(gamePath, true)) {
        return path.join(gamePath, 'mods');
      }
      return modsFolder;
    }
    else {
      return config.get<string>('modsFolder');
    }
  }

  public static ensureModsFolder(options?: { filePath?: string, version?: anno.GameVersion }): boolean {
    const modsFolder = GamePaths.getModsFolder();

    const version = options?.version ?? modContext.getVersion();
    const pathSetting = (version === anno.GameVersion.Anno8) ? 'anno.117.modsFolder' : 'anno.modsFolder';
    const settingsFocus = (version === anno.GameVersion.Anno8) ? 'anno.117.gamePath mods' : 'anno.ModsFolder';

    const exists = modsFolder && fs.existsSync(modsFolder);

    if (!exists && modsFolder && fs.existsSync(path.dirname(modsFolder))) {
      try {
        fs.mkdirSync(modsFolder);
      } catch {}
    }

    if (!modsFolder || !fs.existsSync(modsFolder)) {
      const goSettings = 'Change Settings';
      (async() => {
        const chosen = await vscode.window.showErrorMessage("Your `" + pathSetting + "` is not set up correctly.", goSettings);
        if (chosen === goSettings) {
          vscode.commands.executeCommand('workbench.action.openSettings', settingsFocus);
        }
      })();
      return false;
    }

    return true;
  }

  static async selectModsFolder(fileUri: vscode.Uri) {
    const config = vscode.workspace.getConfiguration('anno');

    const gamePath = config.get<string>('117.gamePath');
    const isArchiveGamePath = gamePath && GamePaths.isValidGamePath(gamePath, true);
    const initialModsFolder = config.get<string>('117.modsFolder');
    let modsFolder = initialModsFolder;
    if (!modsFolder && isArchiveGamePath) {
      modsFolder = path.join(gamePath, 'mods');
      if (fs.existsSync(gamePath) && !fs.existsSync(modsFolder)) {
        fs.mkdirSync(modsFolder);
      }
    }

    const result = await vscode.window.showOpenDialog({
      defaultUri: vscode.Uri.file(modsFolder ?? ''),
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Select Anno 117 Mods Folder'
    });

    if (!result) {
      return;
    }

    modsFolder = result[0].fsPath;

    if (isArchiveGamePath && normalizeWithDrive(modsFolder) === normalizeWithDrive(path.join(gamePath, 'mods'))) {
      modsFolder = '';
    }

    await config.update('117.modsFolder', modsFolder, vscode.ConfigurationTarget.Global);
  }

  // gamePath

  public static getGamePath(options?: { filePath?: string, version?: anno.GameVersion }): string | undefined {
    const config = vscode.workspace.getConfiguration('anno');

    const version = options?.version ?? modContext.getVersion();

    if (version === anno.GameVersion.Anno8) {
      const gamePath = config.get<string>('117.gamePath');
      // TODO check if valid?
      return gamePath;
    }
    else {
      throw 'Not implemented';
    }
  }

  public static ensureGamePath(options?: { filePath?: string, version?: anno.GameVersion }): boolean {
    const config = vscode.workspace.getConfiguration('anno');
    const version = options?.version ?? modContext.getVersion();

    let valid = false;

    if (version === anno.GameVersion.Anno7) {
      const annoMods: string | undefined = config.get<string>('rdaFolder');

      const validPath = annoMods !== undefined && annoMods !== "" && fs.existsSync(annoMods);
      valid = validPath && fs.existsSync(path.join(annoMods, anno.ANNO7_ASSETS_PATH));

      if (!valid) {
        const goSettings = 'Change Settings';
        (async() => {
          const chosen = await vscode.window.showErrorMessage("`anno.rdaFolder` is not set up correctly.\n\nIt does not contain `" + anno.ANNO7_ASSETS_PATH + "`.", goSettings);
          if (chosen === goSettings) {
            vscode.commands.executeCommand('workbench.action.openSettings', 'anno.rdaFolder');
          }
        })();
        return false;
      }
    }
    else if (version === anno.GameVersion.Anno8) {
      const annoMods: string | undefined = config.get<string>('117.gamePath');

      // TODO rda files are not supported yet
      // const validPath = annoMods !== undefined && annoMods !== "" && fs.existsSync(annoMods);
      // const validExtractedPath = validPath && fs.existsSync(path.join(annoMods, utils.ANNO8_ASSETS_PATH));

      const validGamePath = annoMods !== undefined && annoMods !== "" && GamePaths.isValidGamePath(annoMods);

      valid = validGamePath;

      if (!valid) {
        const goSettings = 'Change Settings';
        (async() => {
          const chosen = await vscode.window.showErrorMessage("`anno.117.gamePath` is not set up correctly.\n\nIt does not contain `maindata/config.rda`, `Bin/Win64/Anno117.exe` or `"
            + anno.ANNO8_ASSETS_PATH + "/assets.xml`.", goSettings);
          if (chosen === goSettings) {
            vscode.commands.executeCommand('workbench.action.openSettings', 'anno.117.gamePath');
          }
        })();
        return false;
      }
    }
    else {
      vscode.window.showErrorMessage("Something went wrong. The game version isn't set.");
      return false;
    }

    return true;
  }

  public static hasGamePath(options?: { filePath?: string, uri?: vscode.Uri, version?: anno.GameVersion }): boolean {
    const config = vscode.workspace.getConfiguration('anno');

    const version = options?.version ?? modContext.getVersion();

    if (version === anno.GameVersion.Anno8) {
      const gamePath = config.get<string>('117.gamePath');
      return gamePath !== undefined && gamePath !== "";
    }
    else {
      return true; // TODO ignore errors for now
    }
  }

  public static getGamePathSetting(options?: { filePath?: string, uri?: vscode.Uri, version?: anno.GameVersion }): string {
    return `117.gamePath`;
  }

  static async selectGamePath(fileUri: vscode.Uri) {
    const config = vscode.workspace.getConfiguration('anno');

    const initialGamePath = config.get<string>('117.gamePath');
    let gamePath = initialGamePath;
    if (!gamePath) {
      gamePath = GamePaths.detectGamePath() ?? '';
    }

    const skipDialog = false; // (initialGamePath !== gamePath && SelectPathCommands.isValidGamePath(gamePath));
    if (!skipDialog) {
      const result = await vscode.window.showOpenDialog({
        defaultUri: vscode.Uri.file(gamePath),
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Select Anno 117 Game Path'
      });

      if (!result) {
        return;
      }

      gamePath = result[0].fsPath;
    }

    if (!GamePaths.isValidGamePath(gamePath)) {
      // auto correct selecting the executable path
      gamePath = GamePaths.correctGamePath(gamePath);
    }

    await config.update('117.gamePath', gamePath, vscode.ConfigurationTarget.Global);
    GamePaths._isGamePathExtracted8 = false;

    if (!GamePaths.isValidGamePath(gamePath)) {
      vscode.window.showErrorMessage(
        `Didn't find \`Bin/Win64/Anno117.exe\`, \`maindata/config.rda\` or \`${anno.ANNO8_ASSETS_PATH}/assets.xml\` in the specified location.`);
    }
    else {
      vscode.window.showInformationMessage("Valid Anno 117 installation found.");
    }
  }

  static detectGamePath(): string | undefined {
    for (const gamePath of ANNO8_SEARCH_PATHS) {
      if (fs.existsSync(gamePath)) {
        return gamePath;
      }
    }

    return undefined;
  }

  static correctGamePath(folderPath: string): string {
    if (fs.existsSync(path.join(folderPath, "Anno117.exe"))
      || fs.existsSync(path.join(folderPath, "Anno8.exe"))) {
        return path.normalize(path.join(folderPath, "../../"));
    }

    return folderPath;
  }

  static isValidGamePath(folderPath: string, archiveOnly: boolean = false): boolean {
    const executable = fs.existsSync(path.join(folderPath, "Bin\\Win64\\Anno117.exe"))
      || fs.existsSync(path.join(folderPath, "Bin\\Win64\\Anno8.exe"));
    const config = fs.existsSync(path.join(folderPath, "maindata\\config.rda"));

    const assets = !archiveOnly && fs.existsSync(path.join(folderPath, anno.ANNO8_ASSETS_PATH, 'assets.xml'));

    return assets || (executable && config);
  }

  static isExtractedGamePath(folderPath: string): boolean {
    return fs.existsSync(path.join(folderPath, anno.ANNO8_ASSETS_PATH, 'assets.xml'));
  }

  static _isGamePathExtracted7: boolean | undefined = undefined;
  static _isGamePathExtracted8: boolean | undefined = undefined;
  public static isGamePathExtracted(options?: { filePath?: string, version?: anno.GameVersion }) {
    const version = options?.version ?? modContext.getVersion();

    if (version === anno.GameVersion.Anno7) {
      GamePaths._isGamePathExtracted7 = true;
      return GamePaths._isGamePathExtracted7;
    }
    else if (version === anno.GameVersion.Anno8) {
      if (GamePaths._isGamePathExtracted8 === undefined) {
        const gamePath = GamePaths.getGamePath({ filePath: options?.filePath, version });
        GamePaths._isGamePathExtracted8 = gamePath !== undefined && GamePaths.isExtractedGamePath(gamePath);
      }
      return GamePaths._isGamePathExtracted8;
    }
  }
}

function normalizeWithDrive(filePath: string) {
  let normalized = path.normalize(filePath);

  if (process.platform === 'win32' && /^[a-zA-Z]:/.test(normalized)) {
    normalized = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  return normalized;
}