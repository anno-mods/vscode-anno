import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import * as anno from '../anno';
import * as rdaConsole from '../tools/rdaConsole';
import * as logger from '../other/logger';
import * as editor from '../editor';

let _storageFolder: string;
let _asAbsolutePath: (relative: string) => string

export function init(context: vscode.ExtensionContext) {
  _storageFolder = context.globalStorageUri.fsPath;
  _asAbsolutePath = context.asAbsolutePath;
}

export function get(relativePath: string, version: anno.GameVersion): string {
  if (version === anno.GameVersion.Anno8 && !editor.isGamePathExtracted({ version })) {
    return extractFromRda(relativePath, version);
  }
  else {
    return selectFromFolder(relativePath, version);
  }

  logger.error(`Couldn't find '${relativePath}'`);
  return relativePath;
}

export function getPatchTarget(filePath: string, version: anno.GameVersion, modRoot?: string): string {
  const anno8 = version === anno.GameVersion.Anno8;
  const basePath = anno8 ? anno.ANNO8_ASSETS_PATH : anno.ANNO7_ASSETS_PATH;
  const basename = path.basename(filePath, path.extname(filePath));

  if (filePath.endsWith('export.bin.xml') || path.dirname(filePath).endsWith("infotips")) {
    return get('data/infotips/export.bin', version);
  }
  else if (basename.indexOf("templates") >= 0) {
    // TODO
    return get(path.join(basePath, 'templates.xml'), version);
  }
  else if (basename.indexOf("texts_") >= 0) {
    // TODO
    return get(path.join((anno8 ? 'data/base/config/gui/' : 'data/config/gui/') + basename + '.xml'), version);
  }
  else if (modRoot && (filePath.endsWith('.cfg.xml') || filePath.endsWith('.fc.xml'))) {
    // TODO
    const relative = path.relative(modRoot, filePath);
    return get(relative.substring(0, relative.length - 4), version);
  }

  return get(path.join(basePath, 'assets.xml'), version);
}

export function getAssetsXml(version: anno.GameVersion) {
  const anno8 = version === anno.GameVersion.Anno8;
  const basePath = anno8 ? anno.ANNO8_ASSETS_PATH : anno.ANNO7_ASSETS_PATH;
  return get(path.join(basePath, 'assets.xml'), version);
}

function extractFromRda(relativePath: string, version: anno.GameVersion) {
  const rdaCachePath = path.join(_storageFolder, 'rda' + version.toString());
  const absolutePath = path.join(rdaCachePath, relativePath);

  const rdaName = path.basename(path.dirname(relativePath)) == 'infotips' ? 'infotips.rda' : 'config.rda';

  const gamePath = ensureGamePath();
  if (!gamePath) {
    // error case
    return `<anno.${getGamePathSetting()}>/maindata/${rdaName}:${relativePath}`;
  }

  const rdaPath = path.join(gamePath, 'maindata', rdaName);

  if (fs.existsSync(absolutePath)) {
    const rdaTimestamp = fs.statSync(rdaPath);
    const fileTimestamp = fs.statSync(absolutePath);
    if (rdaTimestamp.mtime < fileTimestamp.mtime) {
      return absolutePath;
    }
    else {
      // rda is newer, let's update
      fs.rmSync(absolutePath);
    }
  }

  const success = rdaConsole.extract(rdaPath, rdaCachePath, relativePath, _asAbsolutePath)
  if (!success) {
    logger.error(`Couldn't extract '${relativePath}' from 'maindata/${rdaName}'`);
    return `<anno.${getGamePathSetting()}>/maindata/${rdaName}:${relativePath}`;
  }

  return absolutePath;
}

function selectFromFolder(relativePath: string, version: anno.GameVersion) {
  const config = vscode.workspace.getConfiguration('anno');

  if (version === anno.GameVersion.Anno7) {
    const annoRda: string = config.get('rdaFolder') ?? "";
    return path.join(annoRda, relativePath);
  }
  else {
    const annoRda: string = config.get('117.gamePath') ?? "";
    return path.join(annoRda, relativePath);
  }
}

function ensureGamePath(): string | undefined {
  // TODO checks
  return vscode.workspace.getConfiguration('anno').get<string>('117.gamePath');
}

function getGamePathSetting(): string {
  return `117.gamePath`;
}
