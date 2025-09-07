import * as vscode from 'vscode';

import * as guidUtilsProvider from '../features/guidUtilsProvider';

export function getTagCloseAt(doc: vscode.TextDocument, position: vscode.Position) {
  let lineNumber = position.line;
  let line = doc.lineAt(lineNumber);
  let index = -1;
  while (index === -1 && lineNumber < doc.lineCount - 1) {
    line = doc.lineAt(lineNumber++);
    index = line.text.search(/<(?=\w)/);
  }

  if (line && index !== -1 && line.text.length > index + 1) {
    if (line.text[index + 1] !== '/') {
      // we're in a tag. probably
      let end = line.text.substring(index + 1).search(/[ \/>]/);
      return {
        name: line.text.substring(index + 1, end === -1 ? undefined : (end + index + 1)),
        line: lineNumber - 1,
        position: index
      };
    }
  }

  return undefined;
}

export function findTagUp(tag: string, doc: vscode.TextDocument, position: vscode.Position) {
  let lineNumber = position.line;
  let line = doc.lineAt(lineNumber);
  let index = -1;
  const exp = new RegExp('<' + tag + '(?=[ />])');
  while (index === -1 && lineNumber >= 0) {
    line = doc.lineAt(lineNumber--);
    index = line.text.search(exp);
  }

  if (index !== -1) {
    return new vscode.Position(lineNumber + 1, index);
  }

  return new vscode.Position(0, 0);
}

export function findTagBegin(tag: string, doc: vscode.TextDocument, position: vscode.Position) {
  let firstTag = getTagCloseAt(doc, position);
  if (firstTag === undefined) {
    return new vscode.Position(0, 0);
  }

  if (firstTag.name !== tag) {
    return findTagUp(tag, doc, position);
  }

  return new vscode.Position(firstTag.line, firstTag.position);
}

export function findTagEnd(tag: string, doc: vscode.TextDocument, position: vscode.Position) {
  let lineNumber = position.line;
  let line = doc.lineAt(lineNumber);
  let index = -1;
  while (index === -1 && lineNumber < doc.lineCount) {
    line = doc.lineAt(lineNumber++);
    index = line.text.indexOf('</' + tag + '>');
  }

  // TODO no opening tags!

  if (index !== -1) {
    return new vscode.Position(lineNumber - 1, index + 3 + tag.length);
  }

  return doc.lineAt(doc.lineCount - 1).range.end;
}

export function getSelectedModOps(doc: vscode.TextDocument, selection: vscode.Selection) {
  let content: string = doc.getText();

  const start = doc.offsetAt(selection.start);
  const end = doc.offsetAt(selection.end);

  const reduceRegexes = [
    /<ModOp [^>]*>([\s\S]*?)<\/ModOp>/g,
    /<(ModOp|Include) [^>]*\/>/g
  ];

  for (const regex of reduceRegexes) {
    content = content.replace(regex, (match, group, offset) => {
      if (offset + match.length <= start || offset >= end) {
        return "";
      } else {
        return match;
      }
    });
  }

  return content;
}

function _findLastKeywordInLine(line: string, position?: number): any {
  if (!position) {
    position = line.length - 1;
  }
  const linePrefix = line.substr(0, position);

  const equalSign = linePrefix.lastIndexOf('=');
  if (equalSign === -1) {
    return undefined;
  }
  const openingTag = linePrefix.lastIndexOf('<');

  const validQuote = equalSign !== -1;
  if (!validQuote) {
    return undefined;
  }

  const propertyMatch = linePrefix.substring(0, equalSign).match(/\s*(\w+)\s*$/);
  vscode.window.showErrorMessage(linePrefix.substring(0, equalSign));
  if (propertyMatch) {
    return {
      name: propertyMatch[1],
      position: linePrefix.length - propertyMatch[1].length,
      type: 'xpath'
    };
  }

  return undefined;
}

export function getAutoCompletePath(document: vscode.TextDocument, position: vscode.Position): [string?, string?] {
  let line = document.lineAt(position.line).text.substring(0, position.character);

  if (line.endsWith('>')) {
    return getNodePath(document, position); // xml tag
  }
  else if (line.endsWith('@') || line.endsWith('=') || line.endsWith('\'') || line.endsWith('\"') || line.endsWith(' ') || line.endsWith(',')) {
    const stringStart = endsWithUnclosedString(line);
    if (stringStart >= 0) {
      // TODO, rework this

      const keyword = _findLastKeywordInLine(line, stringStart);
      if (keyword?.type === 'xpath' && keyword.name) {
        return [ keyword.name, 'XPath'];
      }

      return [ undefined, 'XPath' ];
    }
  }

  return getNodePath(document, position);
}

function endsWithUnclosedString(line: string): number {
  const end = line.length + 1;

  let inSingle = end;
  let inDouble = end;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"' && inSingle === end) {
      inDouble = i;
    }
    else if (char === "'" && inDouble === end) {
      inSingle = i;
    }
  }

  const stringStart = Math.min(inSingle, inDouble);
  return stringStart === end ? -1 : stringStart;
}

// duplicate: guidUtilsProvider:findKeywordAtPosition
export function getNodePath(document: vscode.TextDocument, position: vscode.Position): [string?, string?] {
  let tags: string[] = [];
  let pos: vscode.Position | undefined = findPreviousTag(document, position, tags);

  while (pos && !matchTagHistory(tags, [ "ModOp", [ "Asset", "Values" ]])) {
    pos = findPreviousTag(document, pos, tags);
  }

  if (tags.length === 0) {
    return [ undefined, undefined ];
  }

  const keyword = tags[0];
  // const root = tags.length > 1 ? tags[tags.length - 1] : undefined;
  const path = tags.slice(1, -1).reverse().join('.');

  return [ keyword, path ];
}

function matchTagHistory(tagHistory: string[], stopPaths: (string|string[])[]): boolean {
  if (tagHistory.length === 0) {
    return false;
  }

  for (const stopPath of stopPaths) {
    if (typeof stopPath === 'string') {
      if (tagHistory[tagHistory.length - 1] === stopPath) {
        return true;
      }
    }
    else {
      for (let i = 0; i < stopPath.length; i++) {
        if (tagHistory[tagHistory.length - i - 1] !== stopPath[i]) {
          return false;
        }
      }
      return true;
    }
  }

  return false;
}

function findPreviousTag(document: vscode.TextDocument, position: vscode.Position, tagHistory: string[]): vscode.Position | undefined {
  // Note: search for <> ignores quotes

  const closingTagStack: string[] = [];
  let inTag = false;
  let tagLines: string[] = [];

  for (let lineNum = position.line; lineNum >= 0; lineNum--) {
    const line = document.lineAt(lineNum).text;
    let startCharacter = 0;
    const endCharacter = lineNum === position.line ? position.character : line.length;
    const lineFragment = line.slice(startCharacter, endCharacter);

    for (let i = lineFragment.length - 1; i >= 0; i--) {
      const char = lineFragment[i];

      if (char === '>' && i > 0 && lineFragment[i - 1] !== '/') {
        inTag = true;
        tagLines = [lineFragment.slice(0, i + 1)];
      }

      if (inTag) {
        // tags can be in multiple lines, track them all and match afterwards again
        // TODO improve by matching already upwards
        // TODO '<\nsomething' is not valid, so we can skip the multiline thing
        tagLines[0] = lineFragment[i] + tagLines[0];

        if (char === '<') {
          const fullTag = tagLines.join('\n');
          const tagMatch = fullTag.match(/^<\s*(\/?)([\w:-]+)/);

          if (tagMatch) {
            const isClosing = tagMatch[1] === '/';
            const tagName = tagMatch[2];

            if (isClosing) {
              closingTagStack.push(tagName);
            }
            else {
              if (closingTagStack.length > 0 && closingTagStack[closingTagStack.length - 1] === tagName) {
                closingTagStack.pop();
              }
              else {
                tagHistory.push(tagName);
                return new vscode.Position(lineNum, i);
              }
            }
          }

          inTag = false;
          tagLines = [];
        }
      }
    }
  }

  // no more tags to be found
  return undefined;
}