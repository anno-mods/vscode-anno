// Anno specific classes without vscode dependencies

import glob = require('glob');
import * as fs from 'fs';
import * as path from 'path';

import { GameVersion } from './gameVersion';
import { ModInfo } from './modInfo';
import { ModRegistry } from '../data/modRegistry';

export * from './modInfo';
export * from './gameVersion';

export const ANNO7_ASSETS_PATH = "data/config/export/main/asset";
export const ANNO8_ASSETS_PATH = "data/base/config/export";

export function getAssetsXmlPath(modPath: string, version: GameVersion = GameVersion.Auto) {
  let filePath;

  if (version === undefined) {
    // fallback to Anno7 since those modinfos did not have a version yet
    version = GameVersion.Anno7;
  }

  if (version === GameVersion.Anno8 || version === GameVersion.Auto) {
    filePath = path.join(modPath, ANNO8_ASSETS_PATH, 'assets');
    if (fs.existsSync(filePath + '_.xml')) {
      return filePath + '_.xml';
    }
    else if (version !== GameVersion.Auto || fs.existsSync(filePath + '.xml'))
    {
      return filePath + '.xml';
    }
  }

  if (version === GameVersion.Anno7 || version === GameVersion.Auto) {
    filePath = path.join(modPath, ANNO7_ASSETS_PATH, 'assets');
    if (fs.existsSync(filePath + '_.xml')) {
      return filePath + '_.xml';
    }
    else if (version !== GameVersion.Auto || fs.existsSync(filePath + '.xml'))
    {
      return filePath + '.xml';
    }
  }

  return undefined;
}

export function getLanguagePath(modPath: string, version: GameVersion = GameVersion.Auto) {
  if (version === undefined) {
    version = GameVersion.Anno7;
  }

  if (version === GameVersion.Anno8) {
    return path.join(modPath, 'data/base/config/gui');
  }

  return path.join(modPath, 'data/config/gui');
}

/** @deprecated use findModRoot instead */
export function searchModPath(patchFilePath: string) {
  return findModRoot(patchFilePath);
}

// finds root path using modinfo.json, data/config/export folder and other indicators
export function findModRoot(modFilePath: string) {
  if (!fs.existsSync(modFilePath)) {
    return modFilePath;
  }
  const isFile = fs.statSync(modFilePath).isFile();
  let searchPath = isFile ? path.dirname(modFilePath) : modFilePath;

  for (let i = 0; i < 30 && searchPath && searchPath !== '/'; i++) {
    if (fs.existsSync(path.join(searchPath, "modinfo.json"))
      || fs.existsSync(path.join(searchPath, "modinfo.jsonc"))
      || fs.existsSync(path.join(searchPath, ANNO7_ASSETS_PATH))
      || fs.existsSync(path.join(searchPath, ANNO8_ASSETS_PATH))
      || fs.existsSync(path.join(searchPath, "data/config/gui"))) {
      return searchPath;
    }

    searchPath = path.dirname(searchPath);
  }

  return isFile ? path.dirname(modFilePath) : modFilePath;
}

export function isAssetsXml(path: string) {
  if (path.endsWith("export.bin.xml") || path.endsWith(".cfg.xml") || path.endsWith(".fc.xml") || path.endsWith("templates.xml")) {
    return false;
  }

  return true;
}

/** Return path of the mod containing the asset file, and it's ModDependencies, OptionalDependencies and LoadAfterIds mod paths */
export function searchModPaths(patchFilePath: string, modsFolder?: string) {
  if (!fs.existsSync(patchFilePath)) {
    return [];
  }

  ModRegistry.use(modsFolder);

  const modPath = findModRoot(patchFilePath);
  const modinfo = ModInfo.read(modPath);

  let deps: string[] = [];
  if (modsFolder && modinfo) {
    deps = modinfo.getAllDependencies()
      .map((e: string) => ModRegistry.getPath(e) ?? "")
      .filter((e: string) => e !== "");
  }

  // remove duplicates
  return [...new Set([modPath, ...deps])];
}

/**
 * Check if graphics file exists or at least matches standard patterns.
 * @returns Empty list when found. Otherwise checked file path patterns.
 */
export function hasGraphicsFile(modPaths: string[], filePath: string, annoRda?: string) {
  let searchPaths = modPaths;

  // ignore some very common, but missing default textures
  if (filePath.endsWith('default_height.png') || filePath.endsWith('default_model_mask.png')) {
    return [];
  }

  filePath = filePath.replace(/\\/g, '/');

  const folderAfterData = filePath.startsWith('data/') ? filePath.substring(5, Math.max(5, filePath.indexOf('/', 5))) : filePath;

  if (folderAfterData === 'ui' || folderAfterData === 'graphics'
    || folderAfterData.startsWith('dlc') || folderAfterData.startsWith('cdlc')
    || folderAfterData === 'eoy21') {
    if (annoRda && annoRda !== '') {
      // check annoRda only if certain folders are there to ensure people actually extracted their RDAs
      if (folderAfterData === 'graphics' && fs.existsSync(path.join(annoRda, 'data/graphics'))) {
        searchPaths = [annoRda, ...modPaths];
      }
      else if (folderAfterData === 'ui' && fs.existsSync(path.join(annoRda, 'data/ui'))) {
        searchPaths = [annoRda, ...modPaths];
      }
      else if (folderAfterData.startsWith('dlc')
        && fs.existsSync(path.join(annoRda, 'data', folderAfterData))) {
          searchPaths = [annoRda, ...modPaths];
      }
      else if (folderAfterData.startsWith('cdlc')
        && fs.existsSync(path.join(annoRda, 'data', folderAfterData))) {
          searchPaths = [annoRda, ...modPaths];
      }
      else if (folderAfterData === 'eoy21' && fs.existsSync(path.join(annoRda, 'data/eoy21'))) {
        searchPaths = [annoRda, ...modPaths];
      }
      else {
        return [];
      }
    }
    else {
      // don't check vanilla, for now...
      return [];
    }
  }

  let checked: string[] = [];

  const fileExistsGlob = (pattern: string) => {
    const files = glob.sync(pattern);
    return files.length > 0;
  };

  for (const modPath of searchPaths) {
    checked = [];

    if (fs.existsSync(path.join(modPath, filePath))) {
      return [];
    }

    checked.push(filePath);

    // try .cfg.yaml
    if (filePath.endsWith('.cfg')) {
      if (fs.existsSync(path.join(modPath, filePath + '.yaml'))) {
        return [];
      }
      checked.push(filePath + '.yaml');
    }

    const folderPath = path.dirname(filePath);
    const fileName = path.basename(filePath);

    // try .dds
    if (fileName.endsWith('.psd')) {
      if (fs.existsSync(path.join(modPath, folderPath, path.basename(fileName, '.psd') + '_0.dds'))) {
        return [];
      }

      if (fs.existsSync(path.join(modPath, folderPath, path.basename(fileName, '.psd') + '.png'))) {
        return [];
      }

      if (fileName.endsWith('_norm.psd')) {
        if (fs.existsSync(path.join(modPath, folderPath, path.basename(fileName, '_norm.psd') + '_rga.png'))) {
          return [];
        }
        checked.push(path.join(folderPath, path.basename(fileName, '_norm.psd') + '_rga.png'));
      }
      checked.push(path.join(folderPath, path.basename(fileName, '.psd') + '_0.dds'));
      checked.push(path.join(folderPath, path.basename(fileName, '.psd') + '.png'));
    }

    // try .gltf
    if (fileName.endsWith('_lod0.rdm')) {
      const baseName = fileName.split('_')[0];
      if (folderPath.endsWith('rdm')) {
        if (fileExistsGlob(path.join(modPath, folderPath, '..', baseName + '*.gltf'))) {
          return [];
        }
        checked.push(path.join(folderPath, '..', baseName + '*.gltf'));
      }
      else {
        if (fileExistsGlob(path.join(modPath, folderPath, baseName + '*.gltf'))) {
          return [];
        }
        checked.push(path.join(folderPath, baseName + '*.gltf'));
      }
    }

    // try .png
    if (fileName.endsWith('.psd') && folderPath.endsWith('maps')) {
      if (fs.existsSync(path.join(modPath, folderPath, '..', path.basename(fileName, '.psd') + '.png'))) {
        return [];
      }
      if (fileName.endsWith('_norm.psd')) {
        if (fs.existsSync(path.join(modPath, folderPath, '..', path.basename(fileName, '_norm.psd') + '_rga.png'))) {
          return [];
        }
        checked.push(path.join(folderPath, '..', path.basename(fileName, '_norm.psd') + '_rga.png'));
      }
      checked.push(path.join(folderPath, '..', path.basename(fileName, '.psd') + '.png'));
    }

    // try .dds from .png
    if (fileName.endsWith('.png')) {
      if (fs.existsSync(path.join(modPath, folderPath, path.basename(fileName, '.png') + '_0.dds'))) {
        return [];
      }
      checked.push(path.join(folderPath, path.basename(fileName, '.png') + '_0.dds'));
    }

    // try .rdp.xml
    if (fileName.endsWith('.rdp')) {
      if (fs.existsSync(path.join(modPath, folderPath, fileName + '.xml'))) {
        return [];
      }
      checked.push(path.join(modPath, folderPath, fileName + '.xml'));
    }
  }

  return checked;
}
