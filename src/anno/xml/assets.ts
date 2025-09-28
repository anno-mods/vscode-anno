import * as path from 'path';
import * as sax from "sax";
import * as xmldoc from 'xmldoc';

import { GameVersion } from '../../anno';
import { SymbolRegistry } from '../../data/symbols';
import * as utils from '../../utils';

export const ASSETS_FILENAME_PATTERN_STRICT = '**/{assets*,*.include,game/asset/**/*}.xml';
export const ASSETS_FILENAME_PATTERN = '**/{assets*,*.include,game/asset/**/*,templates,tests/*-input,tests/*-expectation,gui/texts_*,.modcache/*-patched,export.bin,*.fc,*.cfg}.xml';

export interface IAsset {
  guid: string;
  template?: string;
  name?: string;
  english?: string;
  modName?: string;
  location?: {
    filePath: string;
    line: number;
  }
  baseAsset?: string;
}

export type PatchType = 'assets' | 'templates' | 'infotips' | 'texts' | 'generic';

export function getPatchType(filePath?: string): PatchType {
  if (!filePath) {
    return 'generic';
  }
  if (path.basename(filePath) === 'assets.xml' || path.basename(filePath) === 'assets_.xml' || filePath.endsWith('.include.xml')) {
    return 'assets';
  }
  else if (path.basename(filePath) === 'templates.xml') {
    return 'templates';
  }

  const type = path.basename(path.dirname(filePath));
  if (type === 'gui') {
    return 'texts';
  }
  else if (type === 'infotips') {
    return 'infotips'
  }

  return 'generic';
}

/** Try to get the best name: `english` > `name` > `guid`.
 * Skip `english` for some templates, or when `name` is a shorter version of it. */
export function english(asset?: IAsset) {
  if (!asset) {
    return '';
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
}

/** Get English (or name as fallback) with template and mod origin. */
export function englishWithTemplate(asset: IAsset | undefined, excludeMod?: string) {
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

/** Get GUID with name (or English as fallback). */
export function guidNamed(asset: IAsset): string {
  return (asset.name ?? asset.english) ? `${asset.guid}: ${asset.name ?? asset.english}` : asset.guid;
}

/** Get template from asset, or base asset. */
export function template(asset: IAsset): string | undefined {
  if (!asset.template) {
    SymbolRegistry.resolveTemplate(asset);
  }
  return asset.template;
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
  public readonly textLines: utils.TextLines;
  public readonly lineCount: number;
  public readonly filePath: string | undefined;

  public readonly type: PatchType;
  public readonly gameVersion: GameVersion;

  public static from(text: string, game: GameVersion, filePath?: string, fast: boolean = false) {
    var xml: xmldoc.XmlDocument | undefined;
    try {
      xml = new xmldoc.XmlDocument(text);
    }
    catch {
      return undefined;
    }

    const doc = new AssetsDocument(xml, text, game, filePath);
    if (!fast) {
      doc.indexCloseEnds(text, xml);
    }
    return doc;
  }

  private constructor(content: xmldoc.XmlDocument, text: string, game: GameVersion, filePath?: string) {
    this.content = content;
    this.assets = {};
    this.lines = [];
    this.textLines = new utils.TextLines(text);
    this.lineCount = this.textLines.length;

    this.type = getPatchType(filePath);
    this.gameVersion = game;

    const nodeStack: { history: xmldoc.XmlElement[], element: xmldoc.XmlNode }[] = [{ history: [], element: this.content }];
    while (nodeStack.length > 0) {
      const top = nodeStack.pop();
      if (top?.element.type === 'element' /*&& relevantNodes.has(top.element.name)*/) {
        const position = this.textLines.positionAt(top.element.startTagPosition - 1);

        this.getLine(position.line).push({
          history: top.history.slice(),
          element: top.element,
          column: position.column
        });

        if (top.element.name === 'GUID') {
          const guid = top.element.val;
          const parent = top.history.length >= 2 ? top.history[top.history.length - 2] : undefined;
          const asset = top.history.length >= 4 ? top.history[top.history.length - 4] : undefined;
          const name = parent?.valueWithPath('Name')?.trim();

          if (parent?.name === 'Standard' && name) {
            const location = (filePath && asset) ? {
              filePath,
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

    this.filePath = filePath;

    if (this.lines.length > this.textLines.length) {
      // Oh noes!
      throw "AssetsDocument (this.lineCount != this.textLines.length): " + filePath;
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

  textLineAt(line: number) {
    return this.textLines.lineAt(line) ?? '';
  }

  getLastElementInLine(line: number) {
    const elements = this.getLine(line);
    return elements[elements.length - 1];
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

  private _startEndPairs: Map<number, number> = new Map<number, number>();

  private indexCloseEnds(xmlText: string, root: xmldoc.XmlDocument) {
    const parser = sax.parser(true);
    const openStarts: number[] = [];

    parser.onopentag = () => {
      // sax startTagPosition is 1-based index of '<'
      openStarts.push((parser as any).startTagPosition as number);
    };
    parser.onclosetag = () => {
      // parser.position is 1-based index AFTER '>' of the closing tag
      const openStart1 = openStarts.pop()!;
      const closeAfter1 = parser.position;
      this._startEndPairs.set(openStart1 - 1, closeAfter1 - 1);
    };

    parser.write(xmlText).close();
  }

  public getEndOffset(el: xmldoc.XmlElement): number | undefined {
    const endOffset = this._startEndPairs.get(el.startTagPosition);
    return endOffset != null ? endOffset : undefined;
  }
}
