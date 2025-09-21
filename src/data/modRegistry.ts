import { glob } from 'glob';
import * as path from 'path';

import { ModInfo, searchModPath } from '../anno';
import * as logger from '../generic/logger';

export namespace ModRegistry {
  let mods_: { [index: string]: ModInfo } = {};
  let folders_: Set<string> = new Set<string>();

  /** add mod folder to scan */
  export function use(folder?: string, prioritize: boolean = false) {
    if (folder === undefined) {
      return;
    }

    if (folders_.has(folder)) {
      // already scanned
      return;
    }

    logger.log('add to mod registry: ' + folder);
    folders_.add(folder);
    scan(folder, prioritize);
  }

  function scan(folder: string, prioritize: boolean) {
    const modinfos = glob.sync('{,*/,*/*/,*/*/*/}modinfo.json', { cwd: folder, nodir: true });

    for (const modinfoPath of modinfos) {
      const metaInfo = ModInfo.read(path.join(folder, modinfoPath));
      if (metaInfo) {
        const existingEntry = mods_[metaInfo.id];
        if (!existingEntry
          || metaInfo.version.isGreaterThan(existingEntry.version)
          || (prioritize && metaInfo.version.isEqualTo(existingEntry.version))) {
          mods_[metaInfo.id] = metaInfo;
        }
      }
    }
  }

  /** (re-)scan for GUIDs */
  export function getAllDependencies(modId: string) : ModInfo[] {
    const mod = get(modId);
    if (!mod) {
      return [];
    }

    const dependencies = mod.getAllDependencies();
    return dependencies.map((e: string) => get(e)).filter((e: ModInfo | undefined) => e !== undefined);
  }

  /** Deprecated. Use `use` and `get` instead. */
  export function getModFolder(modsFolder: string, modId: string): string | undefined {
    use(modsFolder);
    return mods_[modId].path;
  }

  /** get mod path */
  export function getPath(modId: string): string | undefined {
    return mods_[modId]?.path;
  }

  /** get mod meta info */
  export function get(modId: string) : ModInfo | undefined {
    return mods_[modId];
  }

  export function findMod(filePath: string) : ModInfo | undefined {
    const modFolder = searchModPath(filePath);
    const modMetaInfo = ModInfo.read(modFolder);

    if (modMetaInfo === undefined) {
      return undefined;
    }

    // TODO why would I read it first, then only assign it if it wasn't already there?
    if (mods_[modMetaInfo.id] === undefined) {
      mods_[modMetaInfo.id] = modMetaInfo;
      return modMetaInfo;
    }

    return mods_[modMetaInfo.id];
  }
}
