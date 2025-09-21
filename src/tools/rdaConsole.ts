import * as child from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as logger from '../utils/logger';

const RDA_CONSOLE_PATH = "./external/build/RdaConsole.exe";

export function extract(rdaFilePath: string, outputPath: string, filter: string,
  asAbsolutePath: (relative: string) => string) {
  const executablePath = asAbsolutePath(RDA_CONSOLE_PATH);

  fs.mkdirSync(outputPath, { recursive: true });

  const absolutePath = path.join(outputPath, filter);
  if (fs.existsSync(absolutePath)) {
    try {
      fs.rmSync(absolutePath);
    }
    catch (exception: any) {
      logger.error(`Extract ${path.basename(rdaFilePath)} failed with exception:`);
      logger.error(exception.message);
      return false;
    }
  }

  filter = filter.replace(/\\/g, '/');

  let output;
  try {
    output = child.execFileSync(executablePath, [
      'extract', '-f', rdaFilePath,
      '--filter', `^${filter}$`,
      '-y', '-o', outputPath,
      '-n'
    ]);
  }
  catch (exception: any) {
    logger.error(`Extract ${path.basename(rdaFilePath)} failed with exception:`);
    logger.error(exception.message);
    return false;
  }

  if (output.toString().startsWith('Nothing left to extract, all files were filtered out')) {
    logger.error(`Extract ${path.basename(rdaFilePath)} failed. ${filter} not found.`);
    return false;
  }

  if (!fs.existsSync(absolutePath)) {
    logger.error(`Extract ${path.basename(rdaFilePath)} failed with error:`);
    logger.error(output.toString());
    return false;
  }

  return true;
}