import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import * as utils from '../../other/utils';
import { GuidCounter } from '../../features/guidCounter';
import * as text from '../../editor/text';
import { SymbolRegistry } from '../../data/symbols';

import * as assets7 from './autoCompleteAssets7.json';

interface IAutoCompleteAttributeInfo {
  name: string
  requires?: string[]
  conflicts?: string[]
  insert?: string
  sort?: string
  values?: string[]
  autoSuggest?: boolean
}
interface IAutoCompleteTagInfo {
  attributes: (string | IAutoCompleteAttributeInfo)[]
}

function getModOpCompletion(skipOpenBracket: boolean, nextOpenClose?: text.OpenClosePosition) {
  const startingBracket = skipOpenBracket ? '' : '<';
  const close = nextOpenClose?.character === '<' || nextOpenClose === undefined;

  if (!close) {
    return [];
  }

  // TODO // getAutoComplete should know if it's tag, attribute, value, XPath, ...
  const add = new vscode.CompletionItem({
    label: `ModOp Add`,
    description: `Adds the content at the end insider of the selection`,
  }, vscode.CompletionItemKind.Property);
  add.insertText = new vscode.SnippetString(`${startingBracket}ModOp Add="$0">\n</ModOp>`);
  add.sortText = `12`;
  const remove = new vscode.CompletionItem({
    label: `ModOp Remove`,
    description: `Removes the selected elements`,
  }, vscode.CompletionItemKind.Property);
  remove.sortText = `15`;
  remove.insertText = new vscode.SnippetString(`${startingBracket}ModOp Remove="$0" />`);
  const append = new vscode.CompletionItem({
    label: `ModOp Append`,
    detail: ` aka addNextSibling`,
    description: `Adds the content after the selection`,
  }, vscode.CompletionItemKind.Property);
  append.insertText = new vscode.SnippetString(`${startingBracket}ModOp Append="$0">\n</ModOp>`);
  const prepend = new vscode.CompletionItem({
    label: `ModOp Prepend`,
    detail: ` aka addPrevSibling`,
    description: `Adds the content before the selection`,
  }, vscode.CompletionItemKind.Property);
  append.sortText = `13`;
  prepend.insertText = new vscode.SnippetString(`${startingBracket}ModOp Prepend="$0">\n</ModOp>`);
  const replace = new vscode.CompletionItem({
    label: `ModOp Replace`,
    description: `Replaces the selected element`,
  }, vscode.CompletionItemKind.Property);
  prepend.sortText = `14`;
  replace.insertText = new vscode.SnippetString(`${startingBracket}ModOp Replace="$0">\n</ModOp>`);
  replace.sortText = `10`;
  const merge = new vscode.CompletionItem({
    label: `ModOp Merge`,
    description: `Adds the content, or replaces it if it already exists`,
  }, vscode.CompletionItemKind.Property);
  merge.insertText = new vscode.SnippetString(`${startingBracket}ModOp Merge="$0">\n</ModOp>`);
  merge.sortText = `11`;

  const include = new vscode.CompletionItem({
    label: `Include`,
    description: `Includes ModOps from another XML file`
  }, vscode.CompletionItemKind.Property);
  include.insertText = new vscode.SnippetString(`${startingBracket}Include File="$0" />`);

  const group = new vscode.CompletionItem({
    label: `Group`,
    description: `Groups multiple ModOps`
  }, vscode.CompletionItemKind.Property);
  group.insertText = new vscode.SnippetString(`${startingBracket}Group>\n  $0\n</Group>`);

  const asset = new vscode.CompletionItem({
    label: `Asset`,
    detail: ` template`,
    description: `Adds an asset using \`Template\``
  }, vscode.CompletionItemKind.Property);
  asset.insertText = new vscode.SnippetString(`${startingBracket}Asset>
  <Template>$0</Template>
  <Values>
    <Standard>
      <GUID></GUID>
      <Name></Name>
    </Standard>
  </Values>
</Asset>`);
  const baseAsset = new vscode.CompletionItem({
    label: `Asset`,
    detail: ` base asset`,
    description: `Adds an asset using \`BaseAssetGUID\``
  }, vscode.CompletionItemKind.Property);
  baseAsset.insertText = new vscode.SnippetString(`${startingBracket}Asset>
  <BaseAssetGUID>$0</BaseAssetGUID>
  <Values>
    <Standard>
      <GUID></GUID>
      <Name></Name>
    </Standard>
  </Values>
</Asset>`);

  return [ add, append, prepend, replace, merge, remove, include, group, asset, baseAsset ];
}

function getModOpAttributeCompletion(nodeInfo: text.XmlPosition) {
  const dict = assets7 as Record<string, IAutoCompleteTagInfo>;
  const tagInfo = nodeInfo?.tag as string ? dict[nodeInfo.tag as string] : undefined;

  if (tagInfo) {
    var items = [];
    for (var attribute of tagInfo.attributes) {
      if (typeof attribute === 'string') {
        if (nodeInfo.attributes && nodeInfo.attributes.find(x => x === attribute)) {
          // do not allow duplicate attributes
          continue;
        }

        const item = new vscode.CompletionItem({
          label: attribute
        }, vscode.CompletionItemKind.Enum);
        item.insertText = new vscode.SnippetString(`${attribute}="$0"`);
        items.push(item);
      }
      else if (typeof attribute === 'object' && attribute as IAutoCompleteAttributeInfo) {
        const complex = attribute as IAutoCompleteAttributeInfo;

        if (nodeInfo.attributes && nodeInfo.attributes.find(x => x === complex.name)) {
          // do not allow duplicate attributes
          continue;
        }

        if (complex.requires) {
          if (!nodeInfo.attributes) {
            continue;
          }
          var cont = true;
          for (const require of complex.requires) {
            if (nodeInfo.attributes.find(x => x === require)) {
              // hide attributes when their required counterpart is not defined yet
              cont = false;
            }
          }
          if (cont) { continue; }
        }

        if (complex.conflicts) {
          var cont = false;
          for (const conflict of complex.conflicts) {
            if (nodeInfo.attributes?.find(x => x === conflict)) {
              // hide when the attribute conflicts with an already defined one
              cont = true;
              continue;
            }
          }
          if (cont) { continue; }
        }

        const item = new vscode.CompletionItem({
          label: complex.name
        }, vscode.CompletionItemKind.Enum);
        item.insertText = complex.insert ?? new vscode.SnippetString(`${complex.name}="$0"`);
        item.sortText = complex.sort;
        if (complex.autoSuggest) {
          item.command = {
            command: 'editor.action.triggerSuggest',
            title: 'Trigger Suggest'
          };
        }
        items.push(item);
      }
    }
    return items;
  }

  return [];
}

function getModOpAttributeValueCompletion(nodeInfo: text.XmlPosition, document: vscode.TextDocument, position: vscode.Position) {
  const dict = assets7 as Record<string, IAutoCompleteTagInfo>;
  const tagInfo = nodeInfo?.tag as string ? dict[nodeInfo.tag as string] : undefined;
  if (!tagInfo) {
    return [];
  }

  const items: vscode.CompletionItem[] = [];

  for (const attribute of tagInfo.attributes) {
    if (typeof attribute === 'object' && attribute as IAutoCompleteAttributeInfo) {
      if (attribute.name === nodeInfo.attribute && attribute.values) {
        for (const val of attribute.values) {
          const item = new vscode.CompletionItem({
            label: val
          }, vscode.CompletionItemKind.Enum);
          item.insertText = val;
          items.push(item);
        }
      }
    }
  }

  return items;
}

export function findFoldersAndIncludes(dir: string) {
  const folders: string[] = [];
  const includes: string[] = [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      folders.push(full);
    } else if (entry.isFile() && entry.name.endsWith(".include.xml")) {
      includes.push(full);
    }
  }

  return { folders, includes };
}

function getIncludeCompletion(nodeInfo: text.XmlPosition, document: vscode.TextDocument, position: vscode.Position) {

  const items: vscode.CompletionItem[] = [];

  var currentPath = path.dirname(document.fileName);
  const modRoot = utils.findModRoot(currentPath);

  const pathLeftOfCursor = text.getAttributeValuePrefixAtCursor(document, position);
  if (pathLeftOfCursor?.valuePrefix.startsWith('/')) {
    currentPath = path.join(modRoot, pathLeftOfCursor?.valuePrefix.substring(1));
  }
  else if (pathLeftOfCursor?.valuePrefix && pathLeftOfCursor?.valuePrefix.length > 0) {
    currentPath = path.join(currentPath, pathLeftOfCursor?.valuePrefix)
  }

  const oneUp = path.basename(path.dirname(currentPath));
  const root = path.basename(modRoot);

  const onlyUpSoFar = !pathLeftOfCursor?.valuePrefix || /^(\.\.\/)*$/.test(pathLeftOfCursor?.valuePrefix);
  const canGoUp = path.dirname(currentPath).length >= modRoot.length;

  if (onlyUpSoFar && canGoUp) { // relative path
    const item = new vscode.CompletionItem({
      label: '../',
      detail: ` ${oneUp}`,
      description: 'Go one folder up'
    }, vscode.CompletionItemKind.Enum);
    item.insertText = '../';
    item.command = {
      command: 'editor.action.triggerSuggest',
      title: 'Trigger Suggest'
    };
    items.push(item);
  }
  if (!pathLeftOfCursor?.valuePrefix || pathLeftOfCursor?.valuePrefix.length === 0) { // mod absolute path
    const item = new vscode.CompletionItem({
      label: '/',
      detail: ` ${root}`,
      description: 'Start at mod folder'
    }, vscode.CompletionItemKind.Enum);
    item.insertText = '/';
    item.command = {
      command: 'editor.action.triggerSuggest',
      title: 'Trigger Suggest'
    };
    items.push(item);
  }

  const folderAndFiles = findFoldersAndIncludes(currentPath);
  for (const folder of folderAndFiles.folders) {
    const basename = path.basename(folder);

    const item = new vscode.CompletionItem({
      label: basename
    }, vscode.CompletionItemKind.Enum);
    item.insertText = basename + '/';
    item.command = {
      command: 'editor.action.triggerSuggest',
      title: 'Trigger Suggest'
    };
    items.push(item);
  }

  for (const file of folderAndFiles.includes) {
    const basename = path.basename(file);

    const item = new vscode.CompletionItem({
      label: basename,
    }, vscode.CompletionItemKind.Enum);
    item.insertText = basename;
    items.push(item);
  }

  return items;
}

export function activate() {
  const provider = vscode.languages.registerCompletionItemProvider(
    { language: 'anno-xml', scheme: 'file' },
    {
      provideCompletionItems(document, position, token, context) {
        const nodeInfo = text.getAutoCompletePath(document, position);

        if (!nodeInfo.path && !nodeInfo.tag && nodeInfo.type !== 'freshOpen') {
          return [];
        }

        if (nodeInfo.isModOpLevel) {
          if (nodeInfo.type === 'freshOpen' || nodeInfo.type === 'freshTagName' || nodeInfo.type === undefined) {
            return getModOpCompletion(nodeInfo.type === 'freshOpen' || nodeInfo.type === 'freshTagName',
              nodeInfo.nextOpenClose);
          }
          else if (nodeInfo.type === 'attribute') {
            return getModOpAttributeCompletion(nodeInfo);
          }
        }

        var acceptGuids = false;
        if (nodeInfo.type === 'value') {
          if (nodeInfo.attribute === 'Type' || nodeInfo.attribute === 'MaxRepeat') {
            return getModOpAttributeValueCompletion(nodeInfo, document, position);
          }
          else if (nodeInfo.tag === 'Include' && nodeInfo.attribute === 'File') {
            return getIncludeCompletion(nodeInfo, document, position);
          }
          else if (nodeInfo.attribute === 'GUID') {
            acceptGuids = true;
          }

          if (nodeInfo.attribute === 'Path' || nodeInfo.attribute === 'Content'
            || nodeInfo.attribute === 'Add' || nodeInfo.attribute === 'Remove'
            || nodeInfo.attribute === 'Append' || nodeInfo.attribute === 'Prepand'
            || nodeInfo.attribute === 'Insert' || nodeInfo.attribute === 'Merge'
            || nodeInfo.attribute === 'Replace' || nodeInfo.attribute === 'Condition') {
            if (nodeInfo.lastSpecialCharacter === '@' || nodeInfo.lastSpecialCharacter === '='
              || nodeInfo.lastSpecialCharacter === '\"' || nodeInfo.lastSpecialCharacter === '\''
            ) {
              acceptGuids = true;
            }
          }
        }
        else if (nodeInfo.type === 'afterClose') {
          acceptGuids = true;
        }

        if (!acceptGuids) {
          return [];
        }

        // TODO for now allow any tag
        // if (!nodePath.endsWith('.GUID')) {
        //   return [];
        // }

        GuidCounter.use(document.uri);

        const items: vscode.CompletionItem[] = [];

        items.push(...GuidCounter.getCompletionItems());

        const symbols = SymbolRegistry.all();
        for (const symbol of symbols.values()) {
          SymbolRegistry.resolveTemplate(symbol);

          if (symbol.template === 'Sequence' ||
            symbol.template === 'Objective' ||
            symbol.template === 'Function' ||
            symbol.template === 'FunctionImmidiate' ||
            symbol.template === 'Decision' ||
            symbol.template === 'SelectObjectiveComponent' ||
            symbol.template === 'FunctionImmediate' ||
            symbol.template === 'SequenceCharNotif' ||
            symbol.template === 'QuestInteractionWindow' ||
            symbol.template === 'PositionMarker' ||
            symbol.template === 'CampaignQuestObject' ||
            symbol.template === 'VisualQuestObject' ||
            symbol.template === 'QuestLine' ||
            symbol.template === 'ProvinceStoryObject' ||
            symbol.template === 'Matcher' ||
            symbol.template === 'StateChecker' ||
            symbol.template === 'TextPool' ||
            symbol.template === 'VisualObject' ||
            symbol.template === 'Prop' ||
            symbol.template === 'Achievement'
          ) {
            continue;
          }

          const item = new vscode.CompletionItem({
            label: `${symbol.english||symbol.name}`,
            description: `${symbol.template}: ${symbol.guid} (${symbol.name})`
          }, vscode.CompletionItemKind.Snippet);
          item.insertText = symbol.guid;
          item.kind = vscode.CompletionItemKind.Value;
          items.push(item);
        }

        return items;
      }
    },
    // TODO disable > trigger until we have proper patch matching.
    // For now just allow it anywhere.
    '@', '\"', '=', ',', ' ', '/' // trigger characters
  );

  return provider;
}
