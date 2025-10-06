import * as fs from 'fs';
import * as path from 'path';
import * as child from 'child_process';

import * as logger from '../utils/logger';

export enum TextureFormat {
  unknown = 0,
  bc1Unorm = 71,
  bc7Unorm = 98
}

let _annotexPath: string | undefined;
let _texconvPath: string | undefined;
export function init(externalPath: string) {
  _texconvPath = path.join(externalPath, 'texconv.exe');
  _annotexPath = path.join(externalPath, 'annotex.exe');
}

export function convertToTexture(sourceFile: string, targetFolder: string, format?: TextureFormat, lods?: number) {
  if (!_annotexPath) {
    return false;
  }
  try {
    const stdout = child.execFileSync(_annotexPath, [
        sourceFile,
        `-f=${format?(format===TextureFormat.bc7Unorm?'diff':'mask'):'auto'}`,
        `-l=${lods||0}`
      ], { cwd: targetFolder, stdio: 'pipe' }).toString();

    let expectedBasename = path.basename(sourceFile, '.png') + '.dds';
    if (sourceFile.endsWith('_rga.png')) {
      expectedBasename = path.basename(sourceFile, '_rga.png') + '_norm.dds';
    }
    else if (sourceFile.endsWith('_r_a.png')) {
      expectedBasename = path.basename(sourceFile, '_r_a.png') + '_metal.dds';
    }
    else if (sourceFile.endsWith('_r_a+b.png')) {
      expectedBasename = path.basename(sourceFile, '_r_a+b.png') + '_metal.dds';
    }

    // ignore stdout
    if (!lods && !fs.existsSync(path.join(targetFolder, expectedBasename)) ||
      lods && lods > 0 && !fs.existsSync(path.join(targetFolder, path.basename(expectedBasename, '.dds') + '_0.dds'))) {
      logger.error(`annotex failed to convert ${sourceFile} due to mysterious reasons.`);
      return false;
    }
    return stdout.split('\n').filter(e => e.indexOf('<=') !== -1).map(e => e.trim().substr(e.indexOf(':') + 2));
  }
  catch (exception: any) {
    logger.error(exception.message);
    return false;
  }
}

export function convertToImage(sourceFile: string, targetFolder: string) {
  if (!_texconvPath) {
    return false;
  }
  try {
    const res = child.execFileSync(_texconvPath, [
      sourceFile,
      '-y', '-ft', 'png', 
      '-o', targetFolder
    ]);
  }
  catch (exception: any) {
    logger.error(exception.message);
    return false;
  }
}
