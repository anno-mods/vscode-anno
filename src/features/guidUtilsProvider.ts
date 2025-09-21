import * as vscode from 'vscode';
import * as fs from 'fs';

import { GuidCounter } from './guidCounter';
import { ModRegistry } from '../data/modRegistry';
import { SymbolRegistry } from '../data/symbols';
import * as editor from '../editor';
import * as editorDocument from '../editor/assetsDocument';
import * as editorFormats from '../editor/formats';
import * as text from '../editor/text';
import { AssetsTocProvider } from '../languages/xml/assetsTocProvider';
import { AssetsDocument, ASSETS_FILENAME_PATTERN, IAsset } from '../utils/assetsXml';
import { AllGuidCompletionItems, GuidCompletionItems } from './guidCompletionItems';

let assetsDocument: AssetsDocument | undefined;

function resolveGuidRange(guid: string) {
  const vanilla = _guidRanges || {};
  const result = [];

  const guidNumber = parseInt(guid);

  let entry = undefined;
  for (let range of vanilla.ranges) {
    if (guidNumber >= range.start && guidNumber <= range.end) {
      entry = range;
      break;
    }
  }

  if (entry) {
    result.push(`${entry.name}'s GUID range. See [github.com/anno-mods/GuidRanges](https://github.com/anno-mods/GuidRanges)`);
  }
  return result;
}

function resolveSafeRange(guid: string) {
  const vanilla = _guidRanges || {};
  const guidNumber = parseInt(guid);
  const addYourRange = 'add your range at [github.com/anno-mods/GuidRanges](https://github.com/anno-mods/GuidRanges)';
  if (guidNumber >= vanilla.safe.start && guidNumber < vanilla.safe.end) {
    return [ `Is safe for your own assets. Remember to ${addYourRange}.` ];
  }
  else {
    return [ `⚠ Is not safe for your own assets.\n\nPlease use from 1.337.471.142 to 2.147.483.647 and ${addYourRange}.` ];
  }
}

interface IKeyword {
  name: string,
  position: number,
  type: 'tag' | 'xpath',
  parent?: IKeyword
}

function _findLastKeywordInLine(line: string, position?: number): IKeyword | undefined {
  if (!position) {
    position = line.length - 1;
  }
  const linePrefix = line.substr(0, position);

  const closingTag = linePrefix.lastIndexOf('>');
  const equalSign = linePrefix.lastIndexOf('=');
  if (closingTag === -1 && equalSign === -1) {
    return undefined;
  }
  const openingTag = linePrefix.lastIndexOf('<');
  
  const validTag = openingTag !== -1 && openingTag <= closingTag;
  const validQuote = equalSign !== -1;
  if (!validQuote && !validTag) {
    return undefined;
  }

  if (validTag && closingTag > equalSign) {
    return {
      name: linePrefix.substr(openingTag + 1, closingTag - openingTag - 1), 
      position: openingTag,
      type: 'tag'
    };
  }
  else {
    const propertyMatch = linePrefix.substring(0, equalSign).match(/\s*(\w+)\s*$/);
    if (propertyMatch) {
      return {
        name: propertyMatch[1],
        position: linePrefix.length - propertyMatch[1].length,
        type: 'xpath'
      };
    }
  }

  return undefined;
}

function findKeywordBeforePosition(document: vscode.TextDocument, position: vscode.Position) {
  const result = text.getAutoCompletePath(document, position);

  if (!result.tag) {
    return undefined;
  }

  return {
    name: result?.tag,
    path: result?.path,
    type: result.path?.startsWith('XPath') ? 'xpath' : 'tag'
  };
}

function findKeywordAtPosition(document: vscode.TextDocument, position: vscode.Position) {
  const word = document.getWordRangeAtPosition(position);
  if (!word) {
    return undefined;
  }

  let parent = undefined;
  if (position.line > 0) {
    // TODO: parsing the whole document is unnecessary expensive
    parent = new AssetsTocProvider(new editorDocument.AssetsDocument(document)).getParentPath(position.line, position.character);
  }

  return {
    name: document.lineAt(word.start.line).text.substr(word.start.character, word.end.character - word.start.character),
    parent
  };
}

function getValueAt(line: string, position: number) {
  let valueEnd = line.length;
  for (let i = position; i < line.length; i++) {
    const codeValue = line.charCodeAt(i);
    if (codeValue < 48 || codeValue > 57) {
      valueEnd = i;
      break;
    }
  }
  let valueBegin = 0;
  for (let i = position; i >= 0; i--) {
    const codeValue = line.charCodeAt(i);
    if (codeValue < 48 || codeValue > 57) {
      valueBegin = i + 1;
      break;
    }
  }
  if (valueBegin >= valueEnd) {
    return undefined;
  }

  const linePrefix = line.substr(0, valueBegin);
  const match = linePrefix.match(/[\s'"<\[](\w+)\s*(=\s*['"](\s*\d+\s*,\s*)*|>\s*)$/);
  if (!match) {
    return undefined;
  }

  return {
    name: match[1],
    text: line.substr(valueBegin, valueEnd - valueBegin)
  };
}

let _guidRanges: { safe: { start: number, end: number }, ranges: { name: string, start: number, end: number }[] };
async function loadGuidRanges(context: vscode.ExtensionContext) {
  if (!_guidRanges) {
    const assetPath = context.asAbsolutePath('./generated/guidranges.json');
    _guidRanges = JSON.parse(fs.readFileSync(assetPath, { encoding: 'utf8' }));
  }
  return _guidRanges;
}

interface IKeywordHelp {
  parent?: string,
  help: string[]
}
let _keywordHelp: { [index: string]: IKeywordHelp[] } | undefined = undefined;
async function loadKeywordHelp(context: vscode.ExtensionContext) {
  if (!_keywordHelp) {
    const assetPath = context.asAbsolutePath('./languages/keywords.json');
    const parsed = JSON.parse(fs.readFileSync(assetPath, { encoding: 'utf8' }));
    _keywordHelp = {};
    for (let entryKey of Object.keys(parsed)) {
      const entryValue = parsed[entryKey];
      if (!Array.isArray(entryValue) || entryValue.length === 0) {
        continue;
      }
      _keywordHelp[entryKey] = typeof entryValue[0] === 'string' ? [ { help: entryValue } ] : entryValue;
    }
  }

  return _keywordHelp;
}

let _customCompletionItems: GuidCompletionItems | undefined = undefined;
export function refreshCustomAssets(document: vscode.TextDocument | undefined): void {
  if (!document || !editorFormats.isAnnoXml(document)
    || document.uri.scheme === 'annoasset'
    || document.uri.scheme === 'annodiff') {
    // _customAssets = undefined;
    // _customCompletionItems = undefined;
    return;
  }

  // Don't clear completion items anymore
  // _customCompletionItems = new GuidCompletionItems();

  const mod = ModRegistry.findMod(document.fileName);
  if (!mod) {
    return;
  }

  ModRegistry.use(vscode.workspace.getWorkspaceFolder(document.uri)?.uri?.fsPath, true);
  ModRegistry.use(editor.getModsFolder({ filePath: document.uri.fsPath, version: mod.game }));

  if (!_customCompletionItems) {
    _customCompletionItems = new GuidCompletionItems();
  }
  // SymbolRegistry.setCompletionItems(_customCompletionItems);

  const dependencies = mod.getAllDependencies();
  for (const dependency of dependencies) {
    const dependencyModinfo = ModRegistry.get(dependency);
    if (dependencyModinfo) {
      SymbolRegistry.scanFolder(dependencyModinfo);
    }
  }
  SymbolRegistry.scanFolder(mod, document.uri.fsPath);

  const text = document.getText();
  SymbolRegistry.scanText(mod, text, document.uri.fsPath);
}

function subscribeToDocumentChanges(context: vscode.ExtensionContext): void {
  if (vscode.window.activeTextEditor) {
    refreshCustomAssets(vscode.window.activeTextEditor.document);
  }
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) {
        refreshCustomAssets(editor.document);
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(e => refreshCustomAssets(e.document))
  );

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument(doc => refreshCustomAssets(undefined))
  );

}

export function registerGuidUtilsProvider(context: vscode.ExtensionContext): vscode.Disposable[] {
  AllGuidCompletionItems.load(context);
  loadGuidRanges(context);
  loadKeywordHelp(context);
  subscribeToDocumentChanges(context);

	return [
    vscode.Disposable.from(vscode.languages.registerHoverProvider({ language: 'xml', scheme: 'file', pattern: ASSETS_FILENAME_PATTERN }, { provideHover })),
    vscode.Disposable.from(vscode.languages.registerHoverProvider({ language: 'anno-xml', scheme: 'file' }, { provideHover })),
    vscode.Disposable.from(vscode.languages.registerCompletionItemProvider({ language: 'xml', scheme: 'file', pattern: ASSETS_FILENAME_PATTERN }, { provideCompletionItems }, '\'', '"'))
  ];
}

function provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
  const keyword = findKeywordBeforePosition(document, position);
  if (!keyword) {
    return undefined;
  }

  const isXpath = keyword.type === 'xpath';

  if (isXpath && keyword.name !== 'Path' && keyword.name !== 'GUID' && keyword.name !== 'Content') {
    // only show for Path, GUID and Content attributes
    return undefined;
  }
  else if (!isXpath && (keyword.name === 'ModOp' || keyword.name === 'ModOps' || keyword.name === 'Include' || keyword.name === 'Group')) {
    return undefined;
  }

  // <New GUID>
  GuidCounter.use(document.uri);
  const items: vscode.CompletionItem[] = [];
  if (!isXpath) {
    // show <New GUID> only in tag scenarios
    items.push(...GuidCounter.getCompletionItems());
  }

  // ignore path in case of xpath checks and allow all templates instead
  const path = isXpath ? undefined : keyword.path;
  const useAnyTemplate = isXpath;
  const templates = useAnyTemplate ? undefined : AllGuidCompletionItems.getAllowedTemplates(keyword.name, path?.replace(/\./g, '/'));

  const symbols = SymbolRegistry.all();
  for (const symbol of symbols.values()) {
    SymbolRegistry.resolveTemplate(symbol);

    if (templates && symbol.template && !templates?.has(symbol.template) &&
      !(symbol.template.indexOf('Building') >= 0 && templates.has('OrnamentalBuilding'))) {
      continue;
    }

    const item = new vscode.CompletionItem({
      label: `${symbol.english ?? symbol.name}`,
      description: `${symbol.template}: ${symbol.guid} (${symbol.name})`
    }, vscode.CompletionItemKind.Snippet);
    item.insertText = symbol.guid;
    item.kind = vscode.CompletionItemKind.Value;
    items.push(item);
  }

  return items;
}

function provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken) {
  const keyword = findKeywordAtPosition(document, position);
  if (keyword && _keywordHelp) {
    const keywordHelp = _keywordHelp[keyword.name];
    if (keywordHelp) {
      for (let help of keywordHelp) {
        if (!help.parent || keyword.parent?.endsWith(help.parent)) {
          return { contents: help.help };
        }
      }
    }
  }

  const value = getValueAt(document.lineAt(position).text, position.character);
  if (!value) {
    return undefined;
  }

  const path = assetsDocument?.getPath(position.line, position.character, true);
  if (AllGuidCompletionItems.get(value.name, path)) {
    const guid = value.text;
    if (guid) {
      const namedGuid = SymbolRegistry.resolve(guid);
      const templateText = namedGuid?.template ? `${namedGuid.template}: ` : '';
      let name = [ ];
      if (namedGuid) {
        if (namedGuid.english) {
          name = [ `${templateText}${namedGuid.english} (${namedGuid.name})` ];
        }
        else {
          name = [ `${templateText}${namedGuid.name}` ];
        }
      }
      else {
        name = [ `GUID ${guid} not found. Some assets like Audio are omitted due to performance.` ];
      }
      const range = resolveGuidRange(guid);
      const safe = (namedGuid || range.length > 0) ? [] : resolveSafeRange(guid);

      return {
        contents: [ ...name, ...range, ...safe ]
      };
    }
  }

  return undefined;
}