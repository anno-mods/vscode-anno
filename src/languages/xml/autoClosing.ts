import * as vscode from 'vscode';

export function registerAutoClosing(context: vscode.ExtensionContext) {
  const disposable = vscode.workspace.onDidChangeTextDocument(event => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || event.document !== editor.document) return;
    if (event.document.languageId !== 'anno-xml') return;

    const changes = event.contentChanges;
    if (changes.length !== 1) return;

    const change = changes[0];
    if (change.text === '>') {
      autoClose(editor, change);
    }
    else if (change.text === '/') {
      selfClose(editor, change);
    }
    // else if ((change.text.startsWith('\n') || change.text.startsWith('\r')) && change.text.trim().length === 0) {
    //   hangingAttribute(editor, change);
    // }
  });

  return disposable;
}

function hangingAttribute(editor: vscode.TextEditor, change: vscode.TextDocumentContentChangeEvent) {
  const prev = editor.document.lineAt(change.range.start.line).text;

  // Match: optional indent, then `<TagName` ... and ensure we haven't closed `>`
  // Examples matched:
  //   <ModOp
  //   <My-Tag   attr="x"
  // but NOT:
  //   <ModOp>           (already closed)
  //   <ModOp/>          (self-closed)
  const m = prev.match(/^(?<indent>\s*)<(?<name>[^\s/>]+)(?![^>]*>)/);
  if (!m || !m.groups) return;

  const baseIndent = m.groups.indent ?? '';
  const tagName = m.groups.name ?? '';

  const spacesCount = Math.max(0, 1 + tagName.length + 1);
  const spaces = ' '.repeat(spacesCount);

  editor.edit(editBuilder => {
    editBuilder.insert(new vscode.Position(change.range.start.line + 1, 0), spaces);
  }).then(() => {
    const pos = new vscode.Position(change.range.start.line + 1, spaces.length);
    editor.selection = new vscode.Selection(pos, pos);
  });
}

function isInOpenQuotation(line: string) {
  var singleQuote = false;
  var doubleQuote = false;

  for (var char of line) {
    if (char === '\'') {
      singleQuote = !singleQuote;
    }
    else if (char === '\"') {
      doubleQuote = !doubleQuote;
    }
  }

  return singleQuote || doubleQuote;
}

function autoClose(editor: vscode.TextEditor, change: vscode.TextDocumentContentChangeEvent) {
  // TODO cleanup this vibe code

  const lineText = editor.document.lineAt(change.range.start.line).text;
  const cursorPos = change.range.start.character;

  const beforeCursor = lineText.substring(0, cursorPos);
  if (beforeCursor.endsWith('/')) {
    return;
  }

  if (isInOpenQuotation(beforeCursor)) {
    return;
  }

  const tagMatch = beforeCursor.match(/<([A-Za-z0-9_:.-]+)[^>]*$/);
  if (!tagMatch) {
    return;
  }

  const tagName = tagMatch[1];

  // Get remaining document text after the just-typed '>'
  const startPos = new vscode.Position(change.range.start.line, cursorPos + 1);
  const endPos = new vscode.Position(editor.document.lineCount - 1, editor.document.lineAt(editor.document.lineCount - 1).text.length);
  const remainingText = editor.document.getText(new vscode.Range(startPos, endPos));

  // Build regex to match this tag
  const openTagRegex = new RegExp(`<${tagName}(\\s[^>]*?)?>`, 'g'); // open tags
  const selfClosingTagRegex = new RegExp(`<${tagName}(\\s[^>]*?)?/>`, 'g'); // self-closing tags
  const closeTagRegex = new RegExp(`</${tagName}>`, 'g'); // closing tags

  // Count tag nesting
  let depth = 1; // We've just opened one <Tag>, so depth starts at 1
  let index = 0;
  while (depth > 0 && index < remainingText.length) {
    const nextOpen = openTagRegex.exec(remainingText);
    const nextSelfClosing = selfClosingTagRegex.exec(remainingText);
    const nextClose = closeTagRegex.exec(remainingText);

    const nexts = [nextOpen, nextSelfClosing, nextClose].filter(x => x !== null) as RegExpExecArray[];
    if (nexts.length === 0) break;

    // Find the closest tag match
    const next = nexts.reduce((a, b) => (a.index < b.index ? a : b));

    if (next === nextSelfClosing) {
      // self-closing — depth unaffected
    } else if (next === nextOpen) {
      depth++;
    } else if (next === nextClose) {
      depth--;
    }

    index = next.index + 1;
    openTagRegex.lastIndex = index;
    selfClosingTagRegex.lastIndex = index;
    closeTagRegex.lastIndex = index;
  }

  if (depth === 0) {
    // Closing tag already exists
    return;
  }

  // Insert closing tag
  const closingTag = `</${tagName}>`;
  const insertPos = new vscode.Position(change.range.start.line, cursorPos + 1);

  editor.edit(editBuilder => {
    editBuilder.insert(insertPos, closingTag);
  }).then(() => {
    editor.selection = new vscode.Selection(insertPos, insertPos);
  });
}

function firstNonWhitespace(text: string) {
  const match = text.match(/^\s*/);
  return match ? match[0].length : 0;
}

function selfClose(editor: vscode.TextEditor, change: vscode.TextDocumentContentChangeEvent) {
  // TODO cleanup this vibe code

  const document = editor.document;
  const position = change.range.start;

  // Get text from start of line to cursor
  const lineText = document.lineAt(position.line).text;
  const beforeCursor = lineText.substring(0, position.character + 1); // include the just-typed '/'

  // Match an opening tag like <Group or <Group attr="x"
  const openTagMatch = beforeCursor.match(/<([A-Za-z0-9_:.-]+)([^<>]*)\/?$/);
  if (!openTagMatch) return;

  const tagName = openTagMatch[1];

  // Now get the full text from cursor to end of document
  const from = new vscode.Position(position.line, position.character + 1);
  const to = new vscode.Position(document.lineCount - 1, document.lineAt(document.lineCount - 1).text.length);
  let remainingText = document.getText(new vscode.Range(from, to));

  // skip whitespace until >
  if (remainingText.substring(0, 0 + 1) !== '>') return;

  // skip whitespace
  remainingText = remainingText.slice(1);
  const skip = firstNonWhitespace(remainingText);
  const afterWhitespace = remainingText.slice(skip);

  // Now look for closing tag
  const closingRegex = new RegExp(`^</${tagName}>`);
  const closingMatch = afterWhitespace.match(closingRegex);
  if (!closingMatch) return;

  // Find exact position of closing tag in document
  const startOffset = document.offsetAt(from) + 1;
  const endOffset = startOffset + skip + closingMatch[0].length;

  const startPos = document.positionAt(startOffset);
  const endPos = document.positionAt(endOffset);

  const closingRange = new vscode.Range(startPos, endPos);

  editor.edit(editBuilder => {
    editBuilder.delete(closingRange);
  });
}
