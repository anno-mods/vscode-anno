import * as xmldoc from 'xmldoc';
import * as vscode from 'vscode';

export const ASSETS_FILENAME_PATTERN_STRICT = '**/{assets*,*.include,game/asset/**/*}.xml';
export const ASSETS_FILENAME_PATTERN = '**/{assets*,*.include,game/asset/**/*,templates,tests/*-input,tests/*-expectation,gui/texts_*,.modcache/*-patched,export.bin,*.fc,*.cfg}.xml';

export interface IAsset {
  guid: string;
  template?: string;
  name?: string;
  english?: string;
  modName?: string;
  location?: {
    filePath: vscode.Uri;
    line: number;
  }
  baseAsset?: string;
}

export function guidWithName(asset: IAsset): string {
  return (asset.name ?? asset.english) ? `${asset.guid}: ${asset.name ?? asset.english}` : asset.guid;
}

export function uniqueAssetName(asset?: IAsset) {
  if (!asset) {
    return ''
  }

  if (!asset.english) {
    if (!asset.name) {
      return asset.guid;
    }
    return asset.name;
  }

  if (!asset.name) {
    return asset.english;
  }

  if (asset.template === "ItemEffectTargetPool") {
    // some templates are usually more descriptive in their name field
    return asset.name;
  }

  const english = asset.english.toLowerCase();
  const name = asset.name.toLowerCase();

  if (english === name) {
    return asset.english;
  }

  if (name.startsWith(english)) {
    return asset.name;
  }

  return asset.english;

  // return `${asset.english} (${asset.name})`;
}

export function assetNameWithOrigin(asset: IAsset | undefined, excludeMod?: string) {
  if (!asset) {
    return '??';
  }

  let text: string = asset.english ?? asset.name ?? "";
  if (excludeMod && asset.modName && excludeMod !== asset.modName) {
    text += ` (${asset.template ?? "?"}, ${asset.modName})`;
  }
  else {
    text += ` (${asset.template ?? "?"})`;
  }

  return text;
}

export interface IPositionedElement {
  history: xmldoc.XmlElement[];
  element: xmldoc.XmlElement;
  column: number;
}

export class AssetsDocument {
  content: xmldoc.XmlDocument;
  assets: { [index: string]: IAsset };

  lines: IPositionedElement[][];

  constructor(content: xmldoc.XmlDocument, filePath?: string) {
    const relevantNodes = new Set<string>(['ModOps', 'ModOp', 'Asset', 'Values', 'Standard', 'GUID']);

    this.content = content;
    this.assets = {};
    this.lines = [];

    const nodeStack: { history: xmldoc.XmlElement[], element: xmldoc.XmlNode }[] = [{ history: [], element: this.content }];
    while (nodeStack.length > 0) {
      const top = nodeStack.pop();
      if (top?.element.type === 'element' /*&& relevantNodes.has(top.element.name)*/) {
        const column = top.element.column - (top.element.position - top.element.startTagPosition + 1);

        this.getLine(top.element.line).push({
          history: top.history.slice(),
          element: top.element,
          column
        });

        if (top.element.name === 'GUID') {
          const guid = top.element.val;
          const parent = top.history.length >= 2 ? top.history[top.history.length - 2] : undefined;
          const asset = top.history.length >= 4 ? top.history[top.history.length - 4] : undefined;
          const name = parent?.valueWithPath('Name')?.trim();

          if (parent?.name === 'Standard' && name) {
            const location = (filePath && asset) ? {
              filePath: vscode.Uri.file(filePath),
              line: asset?.line ?? 0
            } : undefined;

            this.assets[guid] = {
              guid,
              name: name,
              template: asset?.valueWithPath('Template'),
              baseAsset: asset?.valueWithPath('BaseAssetGUID'),
              location
            };
            continue;
          }
        }

        const children = (top.element.children ? top.element.children.filter((e) => e.type === 'element') : []).map((e) => (
          { history: [...top.history, e as xmldoc.XmlElement], element: e }
        ));
        if (children.length > 0) {
          // has tag children
          nodeStack.push(...children.reverse());
        }
      }
      else {
        // ignore
      }
    }
  }

  hasLine(line: number) {
    return (line < this.lines.length);
  }

  getLine(line: number) {
    while (line >= this.lines.length) {
      this.lines.push([]);
    }
    return this.lines[line];
  }

  getClosestElementLeft(line: number, position: number) {
    if (line >= this.lines.length) {
      return undefined;
    }

    const thisLine = this.lines[line];
    if (thisLine.length === 0 || thisLine[0].column > position) {
      while (line > 0) {
        line--;
        if (this.lines[line].length > 0) {
          return this.lines[line].slice(-1)[0];
        }
      }
    }

    let i = 0;
    while (i < thisLine.length - 1 && (thisLine[i + 1].column <= position)) {
      i++;
    }

    return thisLine[i];
  }

  getPath(line: number, position: number, removeLast: boolean = false) {
    let path = this.getClosestElementLeft(line, position)?.history;
    let prefix = undefined;
    while (path && path.length > 0 && (path[0].name === 'Asset' || path[0].name === 'ModOp' || path[0].name === 'Assets'))
    {
      if (path[0].name === 'ModOp' && path[0].attr['Path']) {
        // TODO replace brackets []
        prefix = path[0].attr['Path'];
        if (!prefix.endsWith('/')) {
          prefix += '/';
        }
        path = path.slice(1);
      }
      else {
        prefix = undefined;
        path = path.slice(1);
      }
    }
    if (path && path.length > 0 && removeLast) {
      path = path.slice(0, -1);
    }
    return path ? ((prefix ?? '/') + path.map(e => e.name).join('/')) : undefined;
  }
}
