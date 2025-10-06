import * as child from 'child_process';
import * as fs from 'fs';
import * as glob from 'glob';
import * as path from 'path';
import * as vscode from 'vscode';

import * as anno from '../anno';
import { ModRegistry } from '../data/modRegistry';
import * as logger from '../utils/logger';

const XMLTEST_PATH = "./external/xmltest.exe";
const XMLTEST2_PATH = "./external/xmltest2.exe";

let _asAbsolutePath: (relative: string) => string

export function init(asAbsolutePath: (relative: string) => string) {
  _asAbsolutePath = asAbsolutePath;
}

export function test(testFolder: string, modFolder: string, patchFile: string, tempFolder: string) {
  const tester = _asAbsolutePath(XMLTEST2_PATH);
  let result = true;

  const inputFiles = glob.sync('**/*-input.xml', { cwd: testFolder, nodir: true });
  for (let inputFile of inputFiles) {

    const absoluteInputFile = path.join(testFolder, inputFile);
    let testerOutput;
    const maxBuffer = 20;
    try {
      const root = anno.findModRoot(patchFile);

      testerOutput = child.execFileSync(tester, [
        '-o', path.join(tempFolder, 'patched.xml'),
        '-v',
        '-m', root,
        absoluteInputFile,
        patchFile], {
          cwd: tempFolder,
          maxBuffer: maxBuffer * 1024 * 1024
        });
    }
    catch (exception: any) {
      logger.error(`Test ${path.basename(inputFile)} failed with exception`);
      logger.error(exception.message);
      return false;
    }

    const logFile = path.join(tempFolder, path.basename(inputFile, '-input.xml') + '-patched.log');
    const logXmlFile = path.join(tempFolder, path.basename(inputFile, '-input.xml') + '-patched.xml');

    const absoluteExpectationFile = path.join(path.dirname(absoluteInputFile), path.basename(absoluteInputFile, '-input.xml') + '-expectation.xml');
    if (_sameWhenMinimized(absoluteExpectationFile, path.join(tempFolder, 'patched.xml'))) {
      logger.log(`Test ${path.basename(inputFile)} OK`);
    }
    else {
      fs.renameSync(path.join(tempFolder, 'patched.xml'), logXmlFile);
      logger.warn(`Test ${path.basename(inputFile)} failed`);
      if (testerOutput) {
        fs.writeFileSync(logFile, testerOutput.toString());
      }
      logger.warn(`Check ${logFile}`);
      result = false; // keep going on to produce full list of test results
    }
  }

  return result;
}

function parseIssue(line: string): IIssue | undefined {
  const regex = /\[(\w+)\]\s[^:]+:\s(.+)\s\(([^:]+):(\d+)\)/;
  const match = regex.exec(line);

  if (match) {
    if (match[1] === 'debug') {
      const timeRegex = /(\d+)ms (\w+)/;
      const timeMatch = timeRegex.exec(match[2]);
      if (timeMatch) {
        return {
          error: false,
          time: parseInt(timeMatch[1]),
          modOpType: timeMatch[2] as 'ModOp' | 'Group' | 'Asset',
          message: match[2],
          file: match[3],
          line: Math.max(0, parseInt(match[4]) - 1)
        };
      }

      return undefined;
    }

    return {
      error: match[1] === 'error',
      message: match[2],
      file: match[3],
      line: Math.max(0, parseInt(match[4]) - 1)
    };
  }

  return undefined;
}

export interface IIssue {
  error: boolean
  message: string
  file: string
  line: number
  time?: number
  modOpType?: 'ModOp' | 'Group' | 'Asset'
}

export function fetchIssues(vanillaXml: string, modPath: string, mainPatchFile: string,
  patchFile: string, patchContent: string, modsFolder: string | undefined): IIssue[] {

  const removeNulls = <S>(value: S | null | undefined): value is S => value !== null && value !== undefined;
  patchFile = patchFile.replace(/\\/g, '/');

  let testerOutput;
  try {
    const modInfo = anno.ModInfo.read(modPath);
    const root = modInfo ? [ '-m', modInfo.path ] : [];
    const version = modInfo?.game || anno.GameVersion.Auto;
    const tester = _asAbsolutePath(version === anno.GameVersion.Anno8 ? XMLTEST2_PATH : XMLTEST_PATH);

    let prepatch = modInfo?.getRequiredLoadAfter().map(e => ['-p', e]) ?? [];

    if (prepatch && modsFolder) {
      prepatch = prepatch.map((e: string[]) => [ e[0], ModRegistry.getModFolder(modsFolder, e[1]) ?? "" ]).filter((e: string[]) => e[1] && e[1] !== "");
    }

    const maxBuffer = 20;
    testerOutput = child.execFileSync(tester, [
      '-s',
      '-v',
      '-i', patchFile,
      ...root,
      ...prepatch.flat(),
      vanillaXml,
      mainPatchFile], {
        input: patchContent,
        encoding: 'utf-8',
        cwd: modPath,
        maxBuffer: maxBuffer * 1024 * 1024
      });
  }
  catch (exception: any) {
    logger.error(`Fetching issues for '${path.basename(patchFile)}' failed with exception`);
    logger.error(exception.message);

    return [ {
      error: true,
      modOpType: 'Group',
      message: `Fetching issues for '${path.basename(patchFile)}' failed with exception`,
      file: patchFile,
      line: 0
    } ];
  }

  const testerLines = testerOutput.split('\n');
  if (testerLines.length <= 1) {
    return [];
  }

  const levelIndex = testerLines[1].indexOf('[', 2);
  const filteredLines = testerLines
    .filter(e => e.indexOf(patchFile) >= 0)
    .filter(e => {
      return e.startsWith('w', levelIndex + 1)
        || e.startsWith('e', levelIndex + 1)
        || e.startsWith('[debug] Time:', levelIndex);
    });

  const issues = filteredLines
    .map(e => parseIssue(e.substring(levelIndex)))
    .filter(removeNulls);

  return issues;
}

export function diff(originalPath: string, patchContent: string, patchFilePath: string, modPath: string,
  modsFolder: string | undefined) {
  if (!originalPath || !patchContent) {
    return { original: '', patched: '', log: ''};
  }

  const workingDir = path.resolve(path.dirname(patchFilePath));
  const maxBuffer = 50;

  ModRegistry.use(modsFolder);
  patchFilePath = patchFilePath.replace(/\\/g, '/');
  // TODO modInfo is usually already available, pass as argument
  const modInfo = anno.ModInfo.read(modPath);
  const version = modInfo?.game || anno.GameVersion.Auto;
  const differ = _asAbsolutePath(version === anno.GameVersion.Anno8 ? XMLTEST2_PATH : XMLTEST_PATH);

  let prepatch = modInfo?.getRequiredLoadAfter().map(e => ['-p', e]) ?? [];
  if (prepatch && modsFolder) {
    prepatch = prepatch.map((e: string[]) => [ e[0], ModRegistry.getPath(e[1]) ?? "" ]).filter((e: string[]) => e[1] && e[1] !== "");
  }

  try {
    const modRelativePath = path.relative(modPath, patchFilePath);

    const res = child.execFileSync(differ, [
        '-c', 'diff',
        '-i', modRelativePath,
        ...prepatch.flat(),
        originalPath,
        patchFilePath,
        '-m', modPath
      ],
      {
        cwd: workingDir,
        input: patchContent,
        encoding: 'utf-8',
        maxBuffer: maxBuffer * 1024 * 1024
    });
    const split = res.split('##annodiff##');
    return { original: split[2], patched: split[1], log: split[0] };
  }
  catch (e) {
    if ((<Error>e).message.endsWith('ENOBUFS')) {
      throw new Error(`Diff exceeds ${maxBuffer} MB!`);
    }
    logger.error((<Error>e).message);
    throw e;
  }
}

function _sameWhenMinimized(expectation: string, patched: string) {
  // remove empty lines from patched to simply checking
  const patchedContent = fs.readFileSync(patched, 'utf8').replace('\r', '').split('\n').map((e) => e.trim()).filter((e) => e);
  // keep empty lines to have correct line output for user
  const expectedContent = fs.readFileSync(expectation, 'utf8').replace('\r', '').split('\n').map((e) => e.trim());

  let patchedLine = -1;
  let line = -1;
  while (line < expectedContent.length && patchedLine < patchedContent.length) {
    patchedLine++;
    line++;
    // skip empty lines, patchedContent does not have empty lines
    while (expectedContent[line] === '' && line < expectedContent.length) {
      line++;
    }

    if (line >= expectedContent.length || patchedLine >= patchedContent.length) {
      break;
    }

    if (expectedContent[line].replace(/\s/, '') !== patchedContent[patchedLine].replace(/\s/, '')) {
      logger.warn(`Issue at line ${line + 1}`);
      logger.warn(`${expectedContent[line]} != ${patchedContent[patchedLine]}`);
      if (expectedContent[line].indexOf('--') !== -1) {
        logger.warn('It looks like you have comments in the *-expectation.xml file. The XML patcher removes them unfortunately. It\'s OK to keep them in the *-input.xml');
      }
      return false;
    }
  }

  // we may have ending empty lines
  while (expectedContent[line] === '' && line < expectedContent.length) {
    line++;
  }

  const expectedLeft = expectedContent.length - line;
  const patchedLeft = patchedContent.length - patchedLine;

  const missingLines = expectedLeft + patchedLeft;
  if (missingLines !== 0) {
    const content = patchedLeft > 0 ? patchedContent : expectedContent;
    const startMissing = patchedLeft > 0 ? patchedLine : line;
    logger.warn(`${patchedLeft > 0 ? 'Expectation' : 'Result'} is missing ${missingLines} lines`);
    for (let missingLine = 0; missingLine < Math.min(5, missingLines); missingLine++) {
      logger.warn(`${content[startMissing + missingLine]}`);
    }
    return false;
  }

  return true;
}

export function show(guid: string|number, filePath: string) {
  const differ = _asAbsolutePath(XMLTEST2_PATH);

  try {
    const res = child.execFileSync(differ, ['-c', 'show', filePath, guid.toString()]);
    return res.toString();
  }
  catch (e)
  {
    vscode.window.showErrorMessage((<Error>e).message);
    throw e;
  }
}