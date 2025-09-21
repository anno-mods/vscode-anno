import * as vscode from 'vscode';
import * as fs from 'fs';
import { IAsset } from '../generic/assetsXml';
import { SymbolRegistry } from '../data/symbols';

interface ITagJson
{
  templates: string[],
  paths: { [index: string]: string[] }
}

class PathCompletionItem {
  path: string;
  templates: string[];

  constructor(path: string, templates: string[]) {
    this.path = path;
    this.templates = templates;
  }

  hasMatchingPath(path: string) {
    if (path.length > this.path.length) {
      return false;
    }

    return this.path.endsWith(path);
  }
}

class TagCompletionItem {
  name: string;
  paths: PathCompletionItem[];

  constructor(name: string, paths: { [path: string]: string[] }) {
    this.name = name;
    this.paths = [];
    for (var path of Object.keys(paths)) {
      this.paths.push(new PathCompletionItem(path, paths[path]));
    }
  }
}

type CompletionItemMap = { [ guid: string]: vscode.CompletionItem };

export class GuidCompletionItems {
  tags: { [tag: string]: TagCompletionItem } | undefined;
  assets: { [index: string]: IAsset } | undefined = undefined;

  _items: { [ template: string]: CompletionItemMap } = {};
  _allItems: CompletionItemMap = {};
  _baseAssetItems: CompletionItemMap = {};

  load(context: vscode.ExtensionContext) {
    if (!this.assets) {
      const assetPath = context.asAbsolutePath('./generated/');
      this.assets = JSON.parse(fs.readFileSync(assetPath + 'assets.json', { encoding: 'utf8' }));
      const tagsData = JSON.parse(fs.readFileSync(assetPath + 'guids.json', { encoding: 'utf8' })) as { [index: string]: ITagJson };

      if (!this.assets) {
        return this.assets;
      }

      this.tags = {};
      for (var tagName of Object.keys(tagsData)) {
        this.tags[tagName] = new TagCompletionItem(tagName, tagsData[tagName].paths);
      }

      for (var asset of Object.keys(this.assets)) {
        this.assets[asset].location = undefined;
      }

      this.fromAssets(this.assets, this.tags, true);
    }

    return this.assets;
  }

  fromAssets(assets: { [guid: string]: IAsset}, tags?: { [tag: string]: TagCompletionItem }, ignoreBaseAssets: boolean = false) {
    this.tags = tags;
    this.assets = assets;
    this._items = {};
    this._allItems = {};
    this._baseAssetItems = {};
    for (let guid of Object.keys(assets)) {
      const asset = assets[guid];
      if (!ignoreBaseAssets || asset.template) {
        this.push(asset.template, guid, asset);
      }
    }
  }

  setTags(tags: { [tag: string]: TagCompletionItem }) {
    this.tags = tags;
  }

  addAssets(assets: { [guid: string]: IAsset}, modName?: string)
  {
    if (!this.assets) {
      this.assets = {};
    }

    for (let guid of Object.keys(assets)) {
      const asset = assets[guid];
      if (modName) {
        asset.modName = modName ?? this.assets[guid]?.modName;
      }
      this.push(asset.template, guid, asset, this.assets[guid] !== undefined);
      this.assets[guid] = asset;
    }
  }

  push(templateName: string | undefined, guid: string, asset: IAsset, remove: boolean = false) {
    const item = new vscode.CompletionItem({
      label: `${asset.english||asset.name}`,
      description: `${asset.template}: ${guid} (${asset.name})`
    }, vscode.CompletionItemKind.Value);
    item.insertText = guid;

    if (templateName) {
      // Template
      const templateItems = this._items[templateName] ?? {};
      templateItems[guid] = item;
      this._items[templateName] = templateItems;
    }
    else {
      // BaseAssetGUID
      this._baseAssetItems[guid] = (item);
    }

    this._allItems[guid] = item;
  }

  get(tagName: string, path?: string) {
    if (!this.tags || !this._items) {
      return undefined;
    }
    const tag = this.tags[tagName];
    if (!tag) {
      return undefined;
    }

    if (path && path.endsWith(tagName)) {
      path = path.substring(0, path.length - tagName.length - 1);
      if (path.endsWith('/')) {
        path = path.substring(0, path.length - 2);
      }
    }
    const paths = path ? tag.paths.filter(e => e.hasMatchingPath(path!)) : tag.paths;
    
    let templates = new Set<string>();
    for (var p of paths) {
      for (var t of p.templates) {
        templates.add(t);
      }
    }

    let items = [];
    for (var t of templates) {
      const completionItems = this._items[t];
      if (completionItems) {
        items.push(...(Object.values(completionItems)));
      }
    }

    items.push(...Object.values(this._baseAssetItems));
    return items;
  }

  getTemplate(asset: IAsset): string | undefined {
    if (asset.template) {
      return asset.template;
    }
    else if (asset.baseAsset) {
      const base = SymbolRegistry.resolve(asset.baseAsset);
      if (base) {
        return this.getTemplate(base);
      }
    }
    return undefined;
  }

  getAllItems() {
    return Object.values(this._allItems);
  }

  getAllowedTemplates(tagName: string, path?: string): Set<string> | undefined
  {
    if (!this.tags) {
      return undefined;
    }
    const tag = this.tags[tagName];
    if (!tag) {
      return undefined;
    }

    if (path && path.endsWith(tagName)) {
      path = path.substring(0, path.length - tagName.length - 1);
      if (path.endsWith('/')) {
        path = path.substring(0, path.length - 2);
      }
    }
    const paths = path ? tag.paths.filter(e => e.hasMatchingPath(path!)) : tag.paths;

    let templates = new Set<string>();
    for (var p of paths) {
      for (var t of p.templates) {
        templates.add(t);
      }
    }

    return templates;
  }
}

export const AllGuidCompletionItems = new GuidCompletionItems();
