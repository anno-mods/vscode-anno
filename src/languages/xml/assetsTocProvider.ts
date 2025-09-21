import * as path from 'path';
import * as vscode from 'vscode';
import * as xmldoc from 'xmldoc';

import { uniqueAssetName} from '../../other/assetsXml';
import * as xpath from '../../other/xpath';
import { SymbolRegistry } from '../../data/symbols';
import { AssetsDocument } from '../../editor/assetsDocument';

export interface TocEntry {
  text: string;
  children?: string[];
  detail: string;
  guid?: string;
  level: number;
  readonly line: number;
  readonly location: vscode.Location;
  readonly symbol: vscode.SymbolKind;
}

export interface SkinnyTextLine {
  text: string;
}

export interface SkinnyTextDocument {
  readonly uri: vscode.Uri;
  readonly version: number;
  readonly lineCount: number;

  lineAt(line: number): SkinnyTextLine;
  getText(): string;
}

/** return first simple element (without element children) */
function _firstElement(parent: xmldoc.XmlElement) {
  for (const element of parent.children) {
    if (element.type === 'element') {
      var hasElementChildren = false;
      for (const child of element.children) {
        if (child.type === 'element') {
          hasElementChildren = true;
        }
      }

      if (!hasElementChildren) {
        return element;
      }
    }
  }

  return undefined;
}

/** shorten text to fit into length */
function _ellipse(text: string | undefined, length: number) {
  if (!text || length < 6 || text.length <= length - 5) {
    return text;
  }
  return text.substring(0, length - 5) + ' [..]';
}

export class AssetsTocProvider {
  private toc?: TocEntry[];
  private _doc: AssetsDocument;

  public constructor(doc: AssetsDocument) {
    this._doc = doc;
  }

  public getToc(): TocEntry[] | undefined {
    if (!this.toc) {
      try {
        this.toc = this._buildToc();
      } catch (e) {
        this.toc = undefined;
      }
    }
    return this.toc;
  }

  public getParentPath(line: number, position: number): string {
    if (!this._doc.xml) {
      return '';
    }

    try {
      return this._getParentPath(this._doc.xml, line, position);
    } catch (e) {
      return '';
    }
  }

  // returns 'ModOp' or template name
  private _getName(element: xmldoc.XmlElement, name?: string): string {
    if (element.name === 'ModOp') {
      const index = 0;

      const guids = element.attr['GUID'];
      if (guids) {
        const guid = guids.split(',')[index].trim();
        const asset = SymbolRegistry.resolve(guid);
        name = uniqueAssetName(asset);
      }

      const path = xpath.basename(element.attr['Path'], true, true);
      if (path && path.length > 0) {
        name = (!name || name.length === 0) ? path : `${path} (${name})`;
      }

      return name || element.attr['Template'] || element.name;
    }
    else if (element.name === 'Group') {
      if (name) {
        return name;
      }
      else if (element.attr['MaxRepeat']) {
        return 'Loop';
      }
    }
    else if (element.name === 'Asset') {
      const name = element.valueWithPath('Values.Standard.Name') ?? element.valueWithPath('Values.Standard.GUID');
      return name ?? element.name;
    }
    else if (element.name === 'Template') {
      return element.valueWithPath('Name') ?? element.name;
    }
    else if (element.name === 'Include') {
      const basename = path.basename(element.attr['File'] ?? '').split('.')[0];
      return (basename?.length > 0) ? basename : '<file>';
    }
    return element.name;
  }

  private _getMultiModOpCount(element: xmldoc.XmlElement) : number {
    return (element.name === 'ModOp' ? element.attr['GUID']?.split(',').length : 0);
  }

  private _getDetail(element: xmldoc.XmlElement, index: number = 0) {
    if (element.name === 'ModOp') {
      if (element.attr['Add']) {
        return 'Add';
      }
      else if (element.attr['Remove']) {
        return 'Remove';
      }
      else if (element.attr['Replace']) {
        return 'Replace';
      }
      else if (element.attr['Merge']) {
        return 'Merge';
      }
      else if (element.attr['Append']) {
        return 'Append';
      }
      else if (element.attr['Prepend']) {
        return 'Prepend';
      }
      return element.attr['Type'] || 'ModOp';
    }
    else if (element.name === 'Asset') {
      const template = element.valueWithPath('Template');
      if (template) {
        return template;
      }
      const base = element.valueWithPath('BaseAssetGUID');
      if (base) {
        const resolvedGuid = SymbolRegistry.resolve(base);
        if (resolvedGuid) {
          return `${resolvedGuid.template}: ${resolvedGuid.name}`;
        }
        else {
          return `${base}`;
        }
      }
    }
    else if (element.name === 'Group') {
      const maxRepeat = element.attr['MaxRepeat'];
      if (maxRepeat) {
        return `MaxRepeat=${maxRepeat}`;
      }
    }
    else if (element.name === 'Include') {
      return element.name;
    }
    return '';
  }

  private _getSymbol(element: xmldoc.XmlElement, index: number = 0) {
    if (element.name === 'Asset') {
      const guid = element.valueWithPath('Values.Standard.GUID');
      return guid;
    }
    return undefined;
  }

  /// Return line number where the comment has occured. Max: 10 lines up.
  private _findCommentUp(document: SkinnyTextDocument, start: number, comment: string) {
    let line = start;
    let maxLineUp = Math.max(0, start - 9);
    for (; line >= maxLineUp; line--) {
      let text = document.lineAt(line);
      if (text.text.includes(comment)) {
        return line;
      }
    }

    // not found
    if (line === -1) {
      line = start;
    }
    return line;
  }

  private _buildToc(): TocEntry[] | undefined {
    if (!this._doc.xml) {
      return undefined;
    }

    let toc: TocEntry[] = [];

    const relevantSections: { [index: string]: any } = {
      /* eslint-disable @typescript-eslint/naming-convention */
      'ModOp': { minChildren: 0, symbol: vscode.SymbolKind.Class },
      'Group': { minChildren: 0, symbol: vscode.SymbolKind.Module },
      'Asset': { minChildren: 1, symbol: vscode.SymbolKind.Function },
      'Template': { minChildren: 1, symbol: vscode.SymbolKind.TypeParameter },
      'Include': { minChildren: 0, symbol: vscode.SymbolKind.File }
      /* eslint-enable @typescript-eslint/naming-convention */
    };

    let sectionComment: string | undefined = 'ModOps';
    let groupComment: string | undefined;

    const nodeStack: { depth: number, element: xmldoc.XmlNode, property: boolean }[] = [{ depth: 0, element: this._doc.xml, property: false }];
    for (let top = nodeStack.pop(); top; top = nodeStack.pop()) {
      if (top.element.type === 'comment') {
        let comment = top.element.comment.trim();
        if (comment.startsWith('#') && top.depth === 1) {
          comment = comment.replace(/#/g, '').trim();
          if (comment) {
            sectionComment = comment;
            groupComment = undefined;
          }
        }
        else if (comment) {
          groupComment = comment;
        }
      }
      else if (top.element.type === 'element') {
        // open ModOp section
        if (sectionComment && relevantSections[top.element.name]) {
          const line = this._findCommentUp(this._doc.document, top.element.line, sectionComment);
          toc.push({
            text: sectionComment,
            detail: '',
            level: top.depth - 1,
            line,
            location: new vscode.Location(this._doc.uri, new vscode.Range(line, 0, line, 1)),
            symbol: vscode.SymbolKind.Number
          });
          sectionComment = undefined;
        }

        const isProperty = top.element.name === 'ModOp';

        const depth = top.depth;
        const children = (top.element.children ? top.element.children.filter((e) => e.type === 'element' || e.type === 'comment') : []).map((e) => (
          { depth: depth + 1, element: e, property: isProperty }
        ));

        // stop going deeper after parent was ModOp (aka this is property)
        if (children.length > 0 && !top.property) {
          nodeStack.push(...children.reverse());
        }

        // check if relevant, also ignore simple items
        const tocRelevant = relevantSections[top.element.name];
        if (tocRelevant && children.length >= tocRelevant.minChildren || top.property) {
          // TODO tagStartColumn is 0 for multiline tags, not correct but ...
          const tagStartColumn = Math.max(0, top.element.column - top.element.position + top.element.startTagPosition - 1);
          const line = (groupComment && top.element.name === 'Group') ? this._findCommentUp(this._doc.document, top.element.line, groupComment) : top.element.line;

          var symbol = relevantSections[top.element.name]?.symbol ?? vscode.SymbolKind.String;
          const location = new vscode.Location(this._doc.uri,
              new vscode.Range(line, tagStartColumn, line, top.element.column));

          // Text below ModOp
          if (top.element.name === 'Text' && top.property && top.element.childNamed('Text')) {
            const text = _ellipse(top.element.childNamed('Text')?.val, 35);

            toc.push({
              text: text || 'Text',
              detail: '',
              level: top.depth, line,
              guid: undefined,
              location,
              symbol: vscode.SymbolKind.Key
            });
          }
          // Template
          else if (top.element.name === 'Template' && top.element.childNamed('Name')) {
            toc.push({
              text: top.element.childNamed('Name')?.val || '<template>',
              detail: 'Template',
              level: top.depth, line,
              guid: undefined,
              location,
              symbol: vscode.SymbolKind.TypeParameter
            });
          }
          // Asset
          else if (top.element.name === 'Asset' && top.element.childNamed('Values')) {
            const template = top.element.valueWithPath('Template');
            if (template === 'FeatureUnlock' || template === 'Unlock' || template === 'Trigger') {
              symbol = vscode.SymbolKind.Event;
            }
            else if (template === 'Text') {
              symbol = vscode.SymbolKind.Key;
            }

            toc.push({
              text: this._getName(top.element, groupComment),
              detail: this._getDetail(top.element),
              level: top.depth, line,
              guid: this._getSymbol(top.element),
              location, symbol
            });
          }
          // Non-Asset below ModOp
          else if (top.property && top.element && top.element.name !== 'Asset') {
            // try to get name from Item/ModItem first
            var name: string | undefined = undefined;
            if (top.element.name === 'Item' || top.element.name === 'ModItem') {
              const item = _firstElement(top.element);
              if (item) {
                const asset = SymbolRegistry.resolve(item.val);
                name = (asset ? uniqueAssetName(asset) : item.val);
              }
            }

            toc.push({
              text: name || top.element.name,
              detail: name ? top.element.name : '',
              level: top.depth, line, guid: undefined, location,
              symbol: vscode.SymbolKind.Field
            });
          }
          // ModOp
          else if (top.element.name === 'ModOp') {
            toc.push({
              text: this._getName(top.element),
              detail: this._getDetail(top.element),
              level: top.depth, line, guid: undefined, location, symbol
            });
          }
          // anything else
          else {
            // const multiModOpCount = this._getMultiModOpCount(top.element);
            toc.push({
              text: this._getName(top.element, groupComment),
              detail: this._getDetail(top.element),
              level: top.depth, line,
              guid: this._getSymbol(top.element),
              location, symbol
            });

            // for (let index = 1; index < multiModOpCount; index++) {
            //   toc.push({
            //     text: this._getName(top.element, groupComment),
            //     detail: this._getDetail(top.element, index),
            //     level: top.depth,
            //     line,
            //     guid: this._getSymbol(top.element, index),
            //     location: new vscode.Location(this._doc.uri,
            //       new vscode.Range(line, tagStartColumn, line, top.element.column)),
            //     symbol: relevantSections[top.element.name]?.symbol ?? vscode.SymbolKind.String
            //   });
            // }
          }
        }
        groupComment = undefined;
      }
      else {
        // ignore
      }
    }

    // preview children in detail
    for (let entry of toc) {
      if (entry.children) {
        let prefix = entry.children[0];
        if (entry.children.length > 1) {
          if (entry.children.join('') === entry.children[0].repeat(entry.children.length)) {
            prefix += '[]';
          }
          else {
            prefix += ', ...';
          }
        }

        // ignore Item, they are the most common e.g. in build menues and just too obvious to justify the clutter
        if (prefix !== 'Item' && prefix !== 'Item[]') {
          prefix += ' → ';
          entry.detail = prefix + entry.detail;
        }
      }
    }

    toc = this._mergeUpOnlyChildGroups(toc);

    // Get full range of section
    return toc.map((entry, startIndex): TocEntry => {
      let end: number | undefined = undefined;
      for (let i = startIndex + 1; i < toc.length; ++i) {
        if (toc[i].level <= entry.level) {
          end = toc[i].line - 1;
          break;
        }
      }
      const endLine = end ?? this._doc.document.lineCount - 1;
      return {
        ...entry,
        location: new vscode.Location(this._doc.uri,
          new vscode.Range(
            entry.location.range.start,
            new vscode.Position(endLine, this._doc.document.lineAt(endLine).text.length)))
      };
    });
  }

  // Merges 'Group' entries that are only childs with their parent
  private _mergeUpOnlyChildGroups(toc: TocEntry[]): TocEntry[] {
    let isOnlyChild = function(array: TocEntry[], start: number) {
      const compare = array[start];
      for (let i = start + 1; i < array.length; i++) {
        if (array[i].level <= compare.level) {
          return (array[i].level < compare.level) ? i : -1;
        }
      }
      return toc.length - 1;
    };
    // let reduceLevel = function(array: TocEntry[], start: number, end: number) {
    //   for (let i = start + 1; i < Math.min(end, array.length); i++) {
    //     array[i].level ++;
    //   }
    // }
    for (let i = 0; i < toc.length; i++) {
      if (toc[i].text === 'Group') {
        const onlyChildEnd = isOnlyChild(toc, i);
        if (onlyChildEnd >= i) {
          // reduceLevel(toc, i + 1, onlyChildEnd);
          toc.splice(i, 1);
        }
      }
    }

    return toc;
  }

  private _getParentPath(xmlContent: xmldoc.XmlDocument, line: number, position: number): string {
    const nodeStack: { history: string[], element: xmldoc.XmlNode }[] = [{ history: [], element: xmlContent }];
    while (nodeStack.length > 0) {
      const top = nodeStack.pop();
      if (top?.element.type === 'element') {
        const name = top.element.name;
        const elementLength = (top.element.position - top.element.startTagPosition);
        if (top.element.line === line && top.element.column > position && top.element.column < position + elementLength) {
          return top.history.join('/');
        }
        if (top.element.line > line) {
          // should not happen
          return '';
        }

        const children = (top.element.children ? top.element.children.filter((e) => e.type === 'element') : []).map((e) => (
          { history: [...top.history, name], element: e }
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

    return '';
  }
}