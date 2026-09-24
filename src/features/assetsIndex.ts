import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import * as logger from '../utils/logger';

const CONFIG_SECTION = 'anno.assetsIndex';

export type InsertPosition = 'sorted' | 'end';

export interface IncludeInsertion {
  offset: number;
  text: string;
}

export interface IncludeRemoval {
  start: number;
  end: number;
  file: string;
}

interface IncludeEntry {
  start: number;
  end: number;
  file: string;
  key: string;
}

interface Settings {
  root: string;
  indexName: string;
  filePattern: RegExp;
  position: InsertPosition;
  notify: boolean;
}

type Report = (message: string) => void;

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.workspace.onDidCreateFiles(async (e) => {
      const messages: string[] = [];
      // sort for a predictable order when many files are created at once
      const files = [...e.files].sort((a, b) => a.fsPath.localeCompare(b.fsPath));
      for (const uri of files) {
        await guarded(`create ${uri.fsPath}`, () => handleCreated(uri, m => messages.push(m)));
      }
      showNotification(messages);
    }),
    vscode.workspace.onDidDeleteFiles(async (e) => {
      const messages: string[] = [];
      for (const uri of e.files) {
        await guarded(`delete ${uri.fsPath}`, () => handleDeleted(uri, m => messages.push(m)));
      }
      showNotification(messages);
    }),
    vscode.workspace.onDidRenameFiles(async (e) => {
      const messages: string[] = [];
      for (const file of e.files) {
        await guarded(`rename ${file.oldUri.fsPath}`, () => handleRenamed(file.oldUri, file.newUri, m => messages.push(m)));
      }
      showNotification(messages);
    })
  );
}

// one notification per event, even if many files were created, deleted or renamed at once
function showNotification(messages: string[]) {
  if (messages.length === 0) {
    return;
  }

  const text = messages.length === 1
    ? messages[0]
    : `${messages.length} changes: ${messages.slice(0, 3).join('; ')}${messages.length > 3 ? '; …' : ''}`;
  // do not await, the promise only resolves when the notification is closed
  void vscode.window.showInformationMessage(`Assets index: ${text}`);
}

async function guarded(what: string, action: () => Promise<void>) {
  try {
    await action();
  }
  catch (error) {
    logger.error(`Updating assets index failed (${what}): ${error}`);
  }
}

function getSettings(uri: vscode.Uri): Settings | undefined {
  if (uri.scheme !== 'file') {
    return undefined;
  }

  const config = vscode.workspace.getConfiguration(CONFIG_SECTION, uri);
  if (!config.get<boolean>('autoUpdate', true)) {
    return undefined;
  }

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
  if (!workspaceFolder) {
    return undefined;
  }

  return {
    root: workspaceFolder.uri.fsPath,
    indexName: config.get<string>('indexName', 'assets__index.xml'),
    filePattern: globToRegex(config.get<string>('filePattern', 'assets_*.xml')),
    position: config.get<string>('insertPosition', 'sorted') === 'end' ? 'end' : 'sorted',
    notify: config.get<boolean>('showNotifications', true)
  };
}

function isIndex(name: string, settings: Settings) {
  return name.toLowerCase() === settings.indexName.toLowerCase();
}

function isTrackable(name: string, settings: Settings) {
  return isIndex(name, settings) || settings.filePattern.test(name);
}

// xml files and folders (no extension) can be referenced by an index
function mayBeReferenced(name: string) {
  return !path.extname(name) || name.toLowerCase().endsWith('.xml');
}

async function handleCreated(uri: vscode.Uri, report: Report) {
  const settings = getSettings(uri);
  if (settings) {
    await addToIndex(uri.fsPath, settings, false, report);
  }
}

async function handleDeleted(uri: vscode.Uri, report: Report) {
  const settings = getSettings(uri);
  if (settings && mayBeReferenced(path.basename(uri.fsPath))) {
    await removeFromIndexes(uri.fsPath, settings, report);
  }
}

async function handleRenamed(oldUri: vscode.Uri, newUri: vscode.Uri, report: Report) {
  const readded = new Set<string>();

  const oldSettings = getSettings(oldUri);
  if (oldSettings && mayBeReferenced(path.basename(oldUri.fsPath))) {
    const removed = await removeFromIndexes(oldUri.fsPath, oldSettings, report);
    const newSettings = getSettings(newUri);

    // put everything that was referenced under its new path back, works for files and folders
    for (const oldPath of removed) {
      if (!newSettings || !oldPath.toLowerCase().startsWith(oldUri.fsPath.toLowerCase())) {
        continue;
      }
      const newPath = newUri.fsPath + oldPath.substring(oldUri.fsPath.length);
      if (!mayBeReferenced(path.basename(newPath))) {
        continue; // e.g. renamed to `assets_test.bak`
      }
      await addToIndex(newPath, newSettings, true, report);
      readded.add(newPath.toLowerCase());
    }
  }

  // e.g. `test.xml` renamed to `assets_test.xml` was not part of an index before
  if (!readded.has(newUri.fsPath.toLowerCase())) {
    await handleCreated(newUri, report);
  }
}

// adds the file to the closest index above it
async function addToIndex(targetPath: string, settings: Settings, force: boolean, report: Report) {
  const name = path.basename(targetPath);
  if (!force && !isTrackable(name, settings)) {
    return;
  }

  // a new index in a sub folder belongs into the index above it
  const searchDir = isIndex(name, settings)
    ? path.dirname(path.dirname(targetPath))
    : path.dirname(targetPath);

  const [indexPath] = getIndexChain(searchDir, settings.indexName, settings.root);
  if (!indexPath || samePath(indexPath, targetPath)) {
    return;
  }

  const relative = toRelative(indexPath, targetPath);
  const document = await vscode.workspace.openTextDocument(indexPath);
  const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
  const insertion = getIncludeInsertion(document.getText(), relative, eol, settings.position);
  if (!insertion) {
    return;
  }

  const edit = new vscode.WorkspaceEdit();
  edit.insert(document.uri, document.positionAt(insertion.offset), insertion.text);
  if (await saveEdit(document, edit) && settings.notify) {
    report(`added ${relative} to ${toWorkspacePath(settings, indexPath)}`);
  }
}

// removes all entries pointing to the path (or into it, if it is a folder) from every index above it
// returns the absolute paths of the removed entries
async function removeFromIndexes(removedPath: string, settings: Settings, report: Report): Promise<string[]> {
  const removedPaths: string[] = [];

  for (const indexPath of getIndexChain(path.dirname(removedPath), settings.indexName, settings.root)) {
    const key = normalizeInclude(toRelative(indexPath, removedPath));
    const document = await vscode.workspace.openTextDocument(indexPath);
    const removals = getIncludeRemovals(document.getText(), k => k === key || k.startsWith(key + '/'));
    if (removals.length === 0) {
      continue;
    }

    const edit = new vscode.WorkspaceEdit();
    for (const removal of removals) {
      edit.delete(document.uri, new vscode.Range(document.positionAt(removal.start), document.positionAt(removal.end)));
    }
    if (await saveEdit(document, edit)) {
      for (const removal of removals) {
        removedPaths.push(path.resolve(path.dirname(indexPath), removal.file.replace(/\\/g, '/')));
      }
      if (settings.notify) {
        const what = removals.length === 1 ? removals[0].file : `${removals.length} entries`;
        report(`removed ${what} from ${toWorkspacePath(settings, indexPath)}`);
      }
    }
  }

  return removedPaths;
}

async function saveEdit(document: vscode.TextDocument, edit: vscode.WorkspaceEdit): Promise<boolean> {
  const wasDirty = document.isDirty;
  if (!await vscode.workspace.applyEdit(edit)) {
    logger.error(`Could not edit ${document.uri.fsPath}`);
    return false;
  }

  // do not silently save changes the user has made themselves
  if (!wasDirty) {
    await document.save();
  }
  return true;
}

/*
 * The functions below are pure so they can be tested without VS Code.
 */

/**
 * Returns where and what to insert, or undefined if the file is already included
 * or the index has no `</ModOps>`.
 * 'sorted' inserts behind the last entry that is not greater than the new one (by relative path, case insensitive),
 * so a mostly sorted list stays sorted. 'end' appends behind the last entry.
 */
export function getIncludeInsertion(text: string, relativePath: string, eol: string, position: InsertPosition = 'end'): IncludeInsertion | undefined {
  const code = blankComments(text);
  const includes = parseIncludes(code);
  const wanted = normalizeInclude(relativePath);

  if (includes.some(include => include.key === wanted)) {
    return undefined;
  }

  const newElement = `<Include File="${relativePath}" />`;

  if (includes.length > 0) {
    let anchor = includes[includes.length - 1];
    let before = false;

    if (position === 'sorted') {
      let index = -1;
      includes.forEach((include, i) => {
        if (compareKeys(include.key, wanted) <= 0) {
          index = i;
        }
      });
      if (index === -1) {
        anchor = includes[0];
        before = true;
      }
      else {
        anchor = includes[index];
      }
    }

    const lineStart = code.lastIndexOf('\n', anchor.start) + 1;
    const indent = /^[ \t]*/.exec(code.substring(lineStart))![0];

    if (before) {
      return { offset: lineStart, text: indent + newElement + eol };
    }

    const lineEndIndex = code.indexOf('\n', anchor.end);
    let offset = lineEndIndex === -1 ? code.length : lineEndIndex;
    if (offset > 0 && code[offset - 1] === '\r') {
      offset--;
    }
    return { offset, text: eol + indent + newElement };
  }

  const closing = /<\/ModOps\s*>/g;
  let closingMatch: RegExpExecArray | undefined;
  let match: RegExpExecArray | null;
  while ((match = closing.exec(code)) !== null) {
    closingMatch = match;
  }
  if (!closingMatch) {
    return undefined;
  }

  const lineStart = code.lastIndexOf('\n', closingMatch.index) + 1;
  if (code.substring(lineStart, closingMatch.index).trim() === '') {
    // </ModOps> stands alone in its line
    return { offset: lineStart, text: '    ' + newElement + eol };
  }
  return { offset: closingMatch.index, text: eol + '    ' + newElement + eol };
}

/**
 * Returns the text ranges to delete for all includes whose normalized path is accepted by `matches`.
 * The whole line is deleted if the include is the only thing in it.
 */
export function getIncludeRemovals(text: string, matches: (key: string) => boolean): IncludeRemoval[] {
  const removals: IncludeRemoval[] = [];

  for (const include of parseIncludes(blankComments(text))) {
    if (!matches(include.key)) {
      continue;
    }

    const lineStart = text.lastIndexOf('\n', include.start) + 1;
    const newline = text.indexOf('\n', include.end);
    const lineEnd = newline === -1 ? text.length : newline;

    if (text.substring(lineStart, include.start).trim() === '' && text.substring(include.end, lineEnd).trim() === '') {
      removals.push({ start: lineStart, end: newline === -1 ? text.length : newline + 1, file: include.file });
    }
    else {
      removals.push({ start: include.start, end: include.end, file: include.file });
    }
  }

  return removals;
}

// blanks out comments but keeps all offsets intact
function blankComments(text: string) {
  return text.replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\r\n]/g, ' '));
}

function parseIncludes(code: string): IncludeEntry[] {
  const includes: IncludeEntry[] = [];
  const includeRegex = /<Include\b[^>]*>/g;
  let match: RegExpExecArray | null;
  while ((match = includeRegex.exec(code)) !== null) {
    const file = /\bFile\s*=\s*"([^"]*)"/.exec(match[0]);
    if (file) {
      includes.push({
        start: match.index,
        end: match.index + match[0].length,
        file: file[1],
        key: normalizeInclude(file[1])
      });
    }
  }
  return includes;
}

// locale aware like the sorting of file explorers: `_` sorts before `.` (assets_cafe_tables.xml before assets_cafe.xml)
function compareKeys(a: string, b: string) {
  return a.localeCompare(b, 'en');
}

export function normalizeInclude(file: string) {
  return file.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
}

function toWorkspacePath(settings: Settings, filePath: string) {
  return path.relative(settings.root, filePath).split(path.sep).join('/');
}

function toRelative(indexPath: string, targetPath: string) {
  return path.relative(path.dirname(indexPath), targetPath).split(path.sep).join('/');
}

function globToRegex(glob: string) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp('^' + escaped + '$', 'i');
}

function isInside(root: string, dir: string) {
  const relative = path.relative(root, dir);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function samePath(a: string, b: string) {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

// all indexes from startDir up to (and including) the workspace root, closest first
function getIndexChain(startDir: string, indexName: string, root: string): string[] {
  const chain: string[] = [];
  let dir = startDir;
  for (let i = 0; i < 50 && isInside(root, dir); i++) {
    const candidate = path.join(dir, indexName);
    if (fs.existsSync(candidate)) {
      chain.push(candidate);
    }
    if (samePath(dir, root)) {
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return chain;
}
