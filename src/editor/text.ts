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
  if (propertyMatch) {
    return {
      name: propertyMatch[1],
      position: linePrefix.length - propertyMatch[1].length,
      type: 'xpath'
    };
  }

  return undefined;
}

export interface OpenClosePosition {
  position: vscode.Position;
  character: string;
}

export class XmlPosition {
  public tag?: string;
  public attribute?: string;
  public path?: string;
  public word?: string;
  public type?: 'other' | 'afterClose' | 'freshOpen' | 'freshTagName' | 'attribute' | 'value' | 'kindaAttribute';
  public nextOpenClose?: OpenClosePosition;
  public isModOpLevel: boolean = false;
  public lastSpecialCharacter?: string;
  public attributes?: string[];
}

function findPreviousCharacter(document: vscode.TextDocument, position: vscode.Position, character: string) {
  // TODO check quotes

  let lineNumber = position.line;
  while (lineNumber >= 0) {
    const line = document.lineAt(lineNumber).text;
    const lineEnd = lineNumber === position.line ? position.character : line.length;

    for (var i = lineEnd - 1; i >= 0; i--) {
      if (line.charAt(i) === character) {
        return new vscode.Position(lineNumber, i);
      }
    }
    lineNumber--;
  }

  return undefined;
}

function findFirstOf(document: vscode.TextDocument,
  characters: string,
  position: vscode.Position,
  endPosition: vscode.Position|undefined = undefined): OpenClosePosition | undefined {
  // TODO check quotes

  let lineNumber = position.line;
  while (lineNumber < document.lineCount && (!endPosition || lineNumber <= endPosition.line)) {
    const line = document.lineAt(lineNumber).text;
    const lineStart = lineNumber === position.line ? position.character : 0;
    const lineEnd = endPosition && lineNumber === endPosition.line ? endPosition.character : line.length;

    for (var i = lineStart; i < lineEnd; i++) {
      for (var character of characters) {
        if (line.charAt(i) === character) {
          return { position: new vscode.Position(lineNumber, i), character };
        }
      }
    }
    lineNumber++;
  }

  return undefined;
}

function getWordAt(document: vscode.TextDocument, position?: vscode.Position) {
  if (position) {
    const wordRange = document.getWordRangeAtPosition(position);
    if (wordRange) {
      return document.getText(wordRange);
    }
  }

  return undefined;
}

function getAttributes(tag: string): string[] {
  // Matches: <tag attr="..." attr2='...'>
  // Captures only the attribute name (supports :, -, . in names)
  const re = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"[^"]*"|'[^']*')/g;

  const names: string[] = [];
  for (const m of tag.matchAll(re)) {
    names.push(m[1]);
  }
  return names;
}

export function getAutoCompletePath(document: vscode.TextDocument, position: vscode.Position): XmlPosition {
  let line = document.lineAt(position.line).text.substring(0, position.character);

  var result: XmlPosition = { isModOpLevel: false };

  const quoteStart = endsWithUnclosedString(line);

  const previewsOpen = findPreviousCharacter(document, position, '<');
  const previewsClose = findPreviousCharacter(document, position, '>');
  const isInTag = previewsOpen ? previewsClose?.isBefore(previewsOpen) ?? true : false;

  result.path = getNodePath(document, position);
  result.word = getWordAt(document, position);

  if (isInTag) {
    result.tag = previewsOpen ? getWordAt(document, new vscode.Position(previewsOpen.line, previewsOpen.character + 1)) : undefined;
    result.nextOpenClose = findFirstOf(document, "<>", position);

    const fullTag = document.getText(new vscode.Range(
      previewsOpen ?? new vscode.Position(0, 0),
      result.nextOpenClose?.position ?? document.lineAt(document.lineCount - 1).range.end)) + ">";

      result.attributes = getAttributes(fullTag);

    if (quoteStart >= 0) {
      result.type = "value";

      // remember last in-value special character
      if (quoteStart != position.character - 1) {
        if (line.endsWith('@') || line.endsWith('=') || line.endsWith('\'') || line.endsWith('\"') || line.endsWith(' ') || line.endsWith(',')) {
          result.lastSpecialCharacter = line.charAt(line.length - 1);
        }
      }

      const keyword = _findLastKeywordInLine(line, quoteStart);
      if (keyword?.type === 'xpath' && keyword.name) {
        result.attribute = keyword.name;
      }
      // }
    }
    else {
      if (line.endsWith('<')) {
        result.type = 'freshOpen';
      }
      else {
        const space = findPreviousCharacter(document, position, ' ');
        if (space?.isAfter(previewsOpen!)) {
          if (line.endsWith(' ') && !line.endsWith('= ')) {
            // `<Tag `
            // `<Tag Attribute="Value" `
            result.type = 'attribute';
          }
          else if (result.word) {
            // `<Tag Attribute`
            result.type = 'attribute';
            result.attribute = result.word;
          }
          else {
            // `<Tag Attribute=`
            // `<Tag Attribute="Value"`
            // `<Tag Attribute= `
            result.type = 'kindaAttribute';
          }
        }
        else {
          // `<Tag`
          result.type = 'freshTagName';
        }
      }
    }
  }
  else if (line.endsWith('>')) {
    result.type = 'afterClose';
  }

  if (result.path) {
    result.isModOpLevel = result.path?.endsWith('/ModOps')
      || result.path?.endsWith('/ModOps/Group')
      || result.path?.endsWith('/ModOps/Group/Group');
  }

  return result;
}

function endsWithUnclosedString(line: string): number {
  const end = line.length + 1;

  let inSingle = end;
  let inDouble = end;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"' && inSingle === end) {
      inDouble = inDouble === end ? i : end;
    }
    else if (char === "'" && inDouble === end) {
      inSingle = inSingle === end ? i : end;
    }
  }

  const stringStart = Math.min(inSingle, inDouble);
  return stringStart === end ? -1 : stringStart;
}

// duplicate: guidUtilsProvider:findKeywordAtPosition
export function getNodePath(document: vscode.TextDocument, position: vscode.Position): string|undefined {
  let tags: string[] = [];
  let pos: vscode.Position | undefined = findPreviousTag(document, position, tags);

  while (pos && !matchTagHistory(tags, [ "ModOp", [ "Asset", "Values" ]])) {
    pos = findPreviousTag(document, pos, tags);
  }

  if (tags.length === 0) {
    return undefined;
  }

  return '/' + tags.reverse().join('/');
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


type ValueAtCursor =
  | { attrName: string; valuePrefix: string; valueRange: vscode.Range; dirPrefix: string }
  | undefined;

/**
 * If the cursor is inside an attribute value like File="/path/|something",
 * returns:
 *  - attrName: e.g. "File"
 *  - valuePrefix: text from quote to cursor, e.g. "/path/"
 *  - valueRange: range of the whole value between quotes (no quotes)
 *  - dirPrefix: valuePrefix truncated to last slash, e.g. "/path/"
 */
export function getAttributeValuePrefixAtCursor(
  document: vscode.TextDocument,
  position: vscode.Position
): ValueAtCursor {
  const lineText = document.lineAt(position.line).text;
  const i = position.character;

  // Find the nearest quote to the left (either " or ')
  const leftDouble = lineText.lastIndexOf('"', i - 1);
  const leftSingle = lineText.lastIndexOf("'", i - 1);
  const leftQuote = Math.max(leftDouble, leftSingle);
  if (leftQuote < 0) return;

  const quoteCh = lineText[leftQuote]; // " or '
  const rightQuote = lineText.indexOf(quoteCh, i); // must match same quote type
  if (rightQuote < 0 || rightQuote <= leftQuote) return;

  // Ensure this is an attribute value (… name = " | " …)
  const before = lineText.slice(0, leftQuote);
  const m = /([A-Za-z_][\w:.-]*)\s*=\s*$/.exec(before);
  if (!m) return;
  const attrName = m[1];

  // Range of the value between quotes (exclusive)
  const valueRange = new vscode.Range(
    new vscode.Position(position.line, leftQuote + 1),
    new vscode.Position(position.line, rightQuote)
  );

  // Text from start of value up to the cursor
  const valuePrefix = lineText.slice(leftQuote + 1, i);

  // Directory-like prefix (keep up to last / or \)
  const dirPrefix = valuePrefix.replace(/[^\\/]*$/, "");

  return { attrName, valuePrefix, valueRange, dirPrefix };
}
