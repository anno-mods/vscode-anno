import * as path from 'path';
import * as fs from 'fs';
import * as jsonc from 'jsonc-parser';

import * as anno from '../anno';
import * as utils from '../utils';
import { Version } from '../utils/version';

const MODINFO_JSON = 'modinfo.json';
const MODINFO_JSONC = 'modinfo.jsonc';

export function isModinfoFile(filePath: string) {
  const basename = path.basename(filePath).toLowerCase();
  return basename === MODINFO_JSONC || basename === MODINFO_JSON;
}

export class ModInfo {
  private modInfo_: any;

  readonly id: string;
  readonly version: Version;
  readonly path: string;
  readonly game: anno.GameVersion;
  readonly filename: string | undefined;

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

    if (anno.isModinfoFile(filePath)) {
      modPath = path.dirname(filePath);
    }
    else {
      modPath = filePath;
    }

    if (!fs.existsSync(modPath)) {
      return undefined;
    }

    var modinfoPath = path.join(modPath, MODINFO_JSON);

    if (!fs.existsSync(modinfoPath)) {
      modinfoPath = path.join(modPath, MODINFO_JSONC);
    }

    if (fs.existsSync(modinfoPath))
    {
      try {
        modInfo = jsonc.parse(fs.readFileSync(modinfoPath, 'utf8'));
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

    return new ModInfo(id, modPath, modInfo, game, path.basename(modinfoPath));
  }

  private constructor(id: string, path: string, modInfo: any, game: anno.GameVersion, filename: string) {
    this.id = id;
    this.path = path;
    this.modInfo_ = modInfo;
    this.game = game;
    this.filename = filename;

    this.version = new Version(this.modInfo_?.Version);
  }

  public getAllDependencies(): string[] {
    if (this.game === anno.GameVersion.Anno8) {
      let deps = new Set([
        ...utils.ensureArray(this.modInfo_?.Dependencies?.Require),
        ...utils.ensureArray(this.modInfo_?.Development?.Dependencies ?? this.modInfo_?.OptionalDependencies),
        ...utils.ensureArray(this.modInfo_?.Dependencies?.LoadAfter)]);

      // remove duplicates
      return [...deps];
    }
    else {
      let deps = new Set([
        ...utils.ensureArray(this.modInfo_?.ModDependencies),
        ...utils.ensureArray(this.modInfo_?.Development?.Dependencies ?? this.modInfo_?.OptionalDependencies),
        ...utils.ensureArray(this.modInfo_?.LoadAfterIds)]);

      // remove duplicates
      return [...deps];
    }
  }

  public getRequiredLoadAfter(): string[] {
    if (this.game === anno.GameVersion.Anno8) {
      const dependencies: string[] = this.modInfo_.Dependencies?.Require ?? [];
      const loadAfterIds: string[] = this.modInfo_.Dependencies?.LoadAfter ?? [];

      return dependencies.filter(dep => loadAfterIds.includes(dep));
    }
    else {
      const dependencies: string[] = this.modInfo_.ModDependencies ?? [];
      const loadAfterIds: string[] = this.modInfo_.LoadAfterIds ?? [];

      return dependencies.filter(dep => loadAfterIds.includes(dep));
    }
  }

  /** return: modinfo.jsonc or modinfo.json, based on what exists and is supported */
  public getModinfoPath(): string {
    if (this.filename === undefined) {
      return this.path;
    }
    return path.join(this.path, this.filename);
  }
}