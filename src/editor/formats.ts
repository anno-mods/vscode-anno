import * as fs from 'fs';
import * as minimatch from 'minimatch';
import * as vscode from 'vscode';
import { ASSETS_FILENAME_PATTERN, ASSETS_FILENAME_PATTERN_STRICT } from '../utils/assetsXml';

const PATCH_FILENAME_PATTERN_STRICT = '**/{assets*,*.include,game/asset/**/*,export.bin,*.fc,*.cfg}.xml';

export function isAnnoXml(document: vscode.TextDocument): boolean {
  if (document.languageId !== 'anno-xml'
      && !(document.uri.scheme.startsWith('annodiff') || document.uri.scheme.startsWith('annoasset'))
      && !minimatch(document.fileName, ASSETS_FILENAME_PATTERN, { dot: true })) {
    return false;
  }

  if (document.lineCount > 100000) {
    // ignore 30k+ lines
    return false;
  }

  if (fs.existsSync(document.fileName) && fs.statSync(document.fileName).size > 1024 * 1024 * 20) {
    // ignore files above 20MB
    return false;
  }

  return true;
}

export function isAssetsXml(document: vscode.TextDocument): boolean {
  return isAnnoXml(document);
}

export function allowLiveValidation(document: vscode.TextDocument): boolean {
  const config = vscode.workspace.getConfiguration('anno', document.uri);

  return (document.languageId ==='anno-xml' || minimatch(document.fileName, PATCH_FILENAME_PATTERN_STRICT, { dot: true }))
    && (config.get('liveModopAnalysis.validate') ?? true);
}

export function isPatchXml(document: vscode.TextDocument): boolean {
  if (document.languageId !== 'anno-xml' && !minimatch(document.fileName, ASSETS_FILENAME_PATTERN, { dot: true })) {
    return false;
  }

  if (document.lineCount > 10000) {
    // ignore 10k+ lines
    return false;
  }

  if (!checkRootTag(document, "ModOps")) {
    // not a ModOps document
    return false;
  }

  return true;
}

function checkRootTag(doc: vscode.TextDocument, tag: string): boolean {
  for (var index = 0; index < doc.lineCount; index++) {
    const line = doc.lineAt(index);
    const match = /<(\w+)/.exec(line.text);
    if (match) {
      return match[1] == tag;
    }
  }
  return false;
}