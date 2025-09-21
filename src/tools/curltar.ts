import * as child from 'child_process';
import * as path from 'path';

import * as fsutils from '../other/fsutils';

export interface ILogger {
  log: (text: string) => void;
  warn: (text: string) => void;
  error: (text: string) => void;
}

export function downloadFile(sourceUrl: string, targetPath: string, logger?: ILogger) {
  fsutils.ensureDir(path.dirname(targetPath));
  try {
    child.execFileSync('curl', [
      '-L',
      '-o', targetPath,
      sourceUrl
    ]);
  }
  catch (e) {
    logger?.error((<Error>e).message);
    throw e;
  }
}

export function extractZip(sourceZipPath: string, targetPath: string, logger?: ILogger) {
  fsutils.ensureDir(path.dirname(targetPath));
  try {
    child.execFileSync('tar', [
      '-xf', sourceZipPath,
      '-C', targetPath
    ]);
  }
  catch (e) {
    logger?.error((<Error>e).message);
    throw e;
  }
}
