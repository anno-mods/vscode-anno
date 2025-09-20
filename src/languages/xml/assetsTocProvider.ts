import * as vscode from 'vscode';
import * as xmldoc from 'xmldoc';
import { uniqueAssetName} from '../../other/assetsXml';
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
    else if (element.name === 'Group' && name) {
      return name;
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
    else if (element.name === 'Template') {
      return element.valueWithPath('Name') ?? element.name;
    }
    return element.name;
  }

  private _getMultiModOpCount(element: xmldoc.XmlElement) : number {
    return (element.name === 'ModOp' ? element.attr['GUID']?.split(',').length : 0);
  }

  private _getDetail(element: xmldoc.XmlElement, index: number = 0) {
    if (element.name === 'ModOp') {
      const guids = element.attr['GUID'];
      if (guids) {
        // return guids.split(',').map(guid => {
        //     const asset = SymbolRegistry.resolve(guid.trim());
        //     return asset?.english ?? asset?.name ?? guid.trim();
        // }).join(', ');
        const guid = guids.split(',')[index].trim();
        const asset = SymbolRegistry.resolve(guid);
        return uniqueAssetName(asset);
      }

      return element.attr['Path'];
    }
    else if (element.name === 'Asset') {
      const name = element.valueWithPath('Values.Standard.Name');
      const guid = element.valueWithPath('Values.Standard.GUID');
      return [name, guid].filter((e) => e).join(', ');
    }
    else if (element.name === 'Include') {
      return element.attr['File'];
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
      'ModOp': { minChildren: 0, symbol: vscode.SymbolKind.Property },
      'Group': { minChildren: 0, symbol: vscode.SymbolKind.Module },
      'Asset': { minChildren: 1, symbol: vscode.SymbolKind.Class },
      'Template': { minChildren: 1, symbol: vscode.SymbolKind.Class },
      'Include': { minChildren: 0, symbol: vscode.SymbolKind.Module }
      /* eslint-enable @typescript-eslint/naming-convention */
    };

    let sectionComment: string | undefined = 'ModOps';
    let groupComment: string | undefined;

    const nodeStack: { depth: number, element: xmldoc.XmlNode }[] = [{ depth: 0, element: this._doc.xml }];
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
            location: new vscode.Location(this._doc.uri,
              new vscode.Range(line, 0, line, 1)),
            symbol: vscode.SymbolKind.Package
          });
          sectionComment = undefined;
        }

        const depth = top.depth;
        const children = (top.element.children ? top.element.children.filter((e) => e.type === 'element' || e.type === 'comment') : []).map((e) => (
          { depth: depth + 1, element: e }
        ));
        if (children.length > 0) {
          // has tag children
          nodeStack.push(...children.reverse());
        }

        // check if relevant, also ignore simple items
        const tocRelevant = relevantSections[top.element.name];
        if (tocRelevant && children.length >= tocRelevant.minChildren) {
          // TODO tagStartColumn is 0 for multiline tags, not correct but ...
          const tagStartColumn = Math.max(0, top.element.column - top.element.position + top.element.startTagPosition - 1);
          const line = (groupComment && top.element.name === 'Group') ? this._findCommentUp(this._doc.document, top.element.line, groupComment) : top.element.line;

          const multiModOpCount = this._getMultiModOpCount(top.element);
          toc.push({
            text: this._getName(top.element, groupComment),
            detail: this._getDetail(top.element),
            level: top.depth,
            line,
            guid: this._getSymbol(top.element),
            location: new vscode.Location(this._doc.uri,
              new vscode.Range(line, tagStartColumn, line, top.element.column)),
            symbol: relevantSections[top.element.name]?.symbol ?? vscode.SymbolKind.String
          });

          for (let index = 1; index < multiModOpCount; index++) {
            toc.push({
              text: this._getName(top.element, groupComment),
              detail: this._getDetail(top.element, index),
              level: top.depth,
              line,
              guid: this._getSymbol(top.element, index),
              location: new vscode.Location(this._doc.uri,
                new vscode.Range(line, tagStartColumn, line, top.element.column)),
              symbol: relevantSections[top.element.name]?.symbol ?? vscode.SymbolKind.String
            });
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