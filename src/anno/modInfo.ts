import * as path from 'path';
import * as fs from 'fs';

import * as anno from '../anno';
import { Version } from '../generic/version';
import * as utils from '../generic/utils';

const MODINFO_JSON = 'modinfo.json'

export class ModInfo {
  private modInfo_: any;

  readonly id: string;
  readonly version: Version;
  readonly path: string;
  readonly game: anno.GameVersion;

  /** filePath: modinfo.json or folder containing one */
  static readVersion(filePath: string) : anno.GameVersion {
    return this.read(filePath)?.game || anno.GameVersion.Auto;
  }

  /** filePath: modinfo.json or folder containing one */
  static read(filePath: string, strict: boolean = false) : ModInfo | undefined {
    let modPath: string | undefined;
    let id: string | undefined;
    let modInfo: any;
    let game: anno.GameVersion = anno.GameVersion.Anno7;

    const fileName = path.basename(filePath);
    if (fileName.toLowerCase().endsWith(MODINFO_JSON)) {
      modPath = path.dirname(filePath);
    }
    else {
      modPath = filePath;
    }

    if (!fs.existsSync(modPath)) {
      return undefined;
    }

    const modinfoPath = path.join(modPath, MODINFO_JSON);

    if (fs.existsSync(modinfoPath))
    {
      try {
        modInfo = JSON.parse(fs.readFileSync(modinfoPath, 'utf8'));
        id = modInfo?.ModID;
        if (modInfo && modInfo.Anno === undefined && fs.existsSync(path.join(modPath, "data/base/config"))) {
          // try to detect Anno8 if the file is valid but doesn't contain a version yet
          game = anno.GameVersion.Anno8;
        }
        else {
          game = (modInfo?.Anno === "8" || modInfo?.Anno === 8) ? anno.GameVersion.Anno8 : anno.GameVersion.Anno7;
        }
      }
      catch {
        // silently ignore, even in strict mode
      }
    } else if (strict) {
      return undefined;
    }

    if (!id || id === "") {
      id = path.basename(modPath);
    }

    return new ModInfo(id, modPath, modInfo, game);
  }

  private constructor(id: string, path: string, modInfo: any, game: anno.GameVersion) {
    this.id = id;
    this.path = path;
    this.modInfo_ = modInfo;
    this.game = game;

    this.version = new Version(this.modInfo_?.Version);
  }

  public getAllDependencies(): string[] {
    let deps = new Set([
      ...utils.ensureArray(this.modInfo_?.ModDependencies),
      // TODO deprecated, use Development.Dependencies instead
      ...utils.ensureArray(this.modInfo_?.Development?.Dependencies ?? this.modInfo_?.OptionalDependencies),
      ...utils.ensureArray(this.modInfo_?.LoadAfterIds)]);

    // remove duplicates
    return [...deps];
  }
}