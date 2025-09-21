
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import * as fsutils from '../utils/fsutils';

interface ICachedFile {
  sha: string,
  output: { [index: string]: {
    sha: string
  }};
}

export class ModCache {
  public data: {
    files: { [index: string]: ICachedFile }
  } = { files: {} };

  public old: any;

  private _cache: string;
  private _vanilla: string;
  private _rda: string;
  private _last?: ICachedFile;

  constructor (mod: string, rda: string) {
    this._cache = path.join(mod, '.modcache');
    this._vanilla = path.join(mod, '.vanilla');
    this._rda = rda;
    this._last = undefined;
  }

  /** Returns true if output is already available */
  public use(sourceFile: string, targetPath?: string) {
    this._last = { sha: _getHash(sourceFile), output: {} };

    const stillGood = (sha: string, targetFile: string) => {
      return (sha === _getHash(targetFile)
        && (!targetPath || targetFile.startsWith(targetPath)));
    }

    // identical file in old cache means we can skip if old output is still correct
    if (this.old?.files && this.old.files[sourceFile]?.sha === this._last.sha) {
      const outputFiles = Object.entries(this.old.files[sourceFile].output);
      if (-1 === outputFiles.findIndex((e: any) => !stillGood(e[1].sha, e[0]))) {
        // store old cache values
        this.data.files[sourceFile] = { ...this._last, ...this.old.files[sourceFile] };
        return true;
      }
    }

    this.data.files[sourceFile] = this._last;
    return false;
  }

  public include(sourceFile: string) {
    // TODO output is wrong when sourceFile is used multiple times
    this.data.files[sourceFile] = { sha: _getHash(sourceFile), output: {} };
  }

  public output(targetFile: string) {
    if (!this._last) {
      return;
    };

    this._last.output[targetFile] = { sha: _getHash(targetFile) };
  }

  public isCiRun() {
    return !this._rda || this._rda.endsWith('.vanilla');
  }

  public saveVanilla() {
    // .vanilla only includes files like .cfg, so always clearing it out is the safer way
    if (fs.existsSync(this._vanilla)) {
      fs.rmdirSync(this._vanilla, { recursive: true });
    }

    let firstVanilla = false;

    for (let file of Object.keys(this.data.files)) {
      if (file.startsWith(this._rda)) {
        const relative = file.substring(this._rda.length + 1);
        if (!firstVanilla) {
          fsutils.ensureDir(this._vanilla);
          fs.writeFileSync(path.join(this._vanilla, 'readme.md'), 'This folder stores unmodified files included with ${annoRda} to be able to build the mod without them.');
          firstVanilla = true;
        }

        const target = path.join(this._vanilla, relative);
        fsutils.ensureDir(path.dirname(target));
        fs.copyFileSync(file, target);
      }
    }
  }

  public load() {
    const filesJson = path.join(this._cache, 'files.json');
    if (fs.existsSync(filesJson)) {
      this.old = JSON.parse(fs.readFileSync(filesJson, 'utf8'));
    }
  }

  public save() {
    fsutils.ensureDir(this._cache);
    fs.writeFileSync(path.join(this._cache, 'files.json'), JSON.stringify(this.data, undefined, "  "));
  }
}

function _getHash(file: string) {
  if (!fs.existsSync(file)) {
    return '';
  }
  const buffer = fs.readFileSync(file);
  const hash = crypto.createHash('sha256');
  hash.update(buffer);
  return hash.digest('hex');
}
