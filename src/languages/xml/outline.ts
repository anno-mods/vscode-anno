import * as path from 'path';
import * as vscode from 'vscode';
import * as xmldoc from 'xmldoc';

import * as xml from '../../anno/xml';
import { SymbolRegistry } from '../../data/symbols';
import * as utils from '../../utils';
import * as xpath from '../../utils/xpath';

import * as logger from '../../utils/logger';

interface MarkdownSymbol {
	readonly level: number;
	readonly parent: MarkdownSymbol | undefined;
	readonly children: vscode.DocumentSymbol[];
}

interface INodeStackNode {
  depth: number;
  element: xmldoc.XmlNode;
  property: boolean
}

export class AssetsSymbolProvider {
	public static register(context: vscode.ExtensionContext): vscode.Disposable[] {
		const selector: vscode.DocumentSelector = [
			{ language: 'anno-xml', scheme: 'file' },
			{ language: 'xml', scheme: 'file', pattern: xml.ASSETS_FILENAME_PATTERN },
      { language: 'xml', scheme: 'annodiff' },
      { language: 'anno-xml', scheme: 'annodiff' },
		];

    const symbolProvider = new AssetsSymbolProvider();

    return [
      vscode.Disposable.from(vscode.languages.registerDocumentSymbolProvider(selector, symbolProvider))
    ];
  }

	private static lastSymbols: vscode.DocumentSymbol[] = [];
	private static lastFile: string | undefined;

  public async provideDocumentSymbols(document: vscode.TextDocument): Promise<vscode.DocumentSymbol[]> {
		const patchDocument = xml.AssetsDocument.from(document.getText(), document.uri.fsPath);
		if (!patchDocument) {
			return AssetsSymbolProvider.lastSymbols;
		}

		const toc = new AssetsTocProvider(patchDocument).getToc();
		if (toc) {
			const root: MarkdownSymbol = {
				level: -Infinity,
				children: [],
				parent: undefined
			};
			this.buildTree(root, toc);

			AssetsSymbolProvider.lastSymbols = root.children;
			AssetsSymbolProvider.lastFile = document.uri.toString();
		}
		else if (AssetsSymbolProvider.lastFile !== document.uri.toString()) {
			// clear outline symbols when the file changed
			AssetsSymbolProvider.lastSymbols = [];
			AssetsSymbolProvider.lastFile = document.uri.toString();
		}

		return AssetsSymbolProvider.lastSymbols;
	}

	private buildTree(parent: MarkdownSymbol, entries: TocEntry[]) {
		if (!entries.length) {
			return;
		}

		const entry = entries[0];
		const symbol = this.toDocumentSymbol(entry);
		symbol.children = [];

		while (parent && entry.level <= parent.level) {
			parent = parent.parent!;
		}
		parent.children.push(symbol);
		this.buildTree({ level: entry.level, children: symbol.children, parent }, entries.slice(1));
	}

	private toDocumentSymbol(entry: TocEntry) {
		return new vscode.DocumentSymbol(
			entry.text,
			entry.detail,
			entry.symbol,
			entry.range,
			entry.range); // TODO
	}
}

export interface TocEntry {
  text: string;
  children?: string[];
  detail: string;
  guid?: string;
  level: number;
  readonly line: number;
  readonly range: vscode.Range;
  // readonly selection: vscode.Range;
  readonly symbol: vscode.SymbolKind;
}

export class AssetsTocProvider {
  private toc?: TocEntry[];
  private _doc: xml.AssetsDocument | undefined;

  public constructor(doc: xml.AssetsDocument | undefined) {
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
    if (!this._doc?.content) {
      return '';
    }

    try {
      return this._getParentPath(this._doc.content, line, position);
    } catch (e) {
      return '';
    }
  }

  // returns 'ModOp' or template name
  private _getName(element: xmldoc.XmlElement, name?: string): string {
    if (element.name === 'ModOp') {
      const index = 0;

      var guids: string | undefined = element.attr['GUID'];
      const [ _, pathValue ] = xml.getPathAttribute(element);

      if (!guids && pathValue) {
        guids = xpath.guid(pathValue);
      }

      if (guids) {
        const guid = guids.split(',')[index].trim();
        const asset = SymbolRegistry.resolve(guid);
        name = xml.english(asset);
      }

      if (pathValue) {
        const path = xpath.basename(pathValue, true, true);
        if (path && path.length > 0) {
          name = (!name || name.length === 0) ? path : `${path} (${name})`;
        }
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
      const [ pathAttr, _ ] = xml.getPathAttribute(element);
      return (pathAttr && pathAttr !== 'Path') ? pathAttr : element.attr['Type'] || 'ModOp';
    }
    else if (element.name === 'Asset') {
      const [ template, name ] = xml.resolveTemplate(element);
      return (template && name) ? `${template}: ${name}` : template ?? name ?? "";
    }
    else if (element.name === 'Group') {
      const maxRepeat = element.attr['MaxRepeat'];
      return (maxRepeat) ? `MaxRepeat=${maxRepeat}` : '';
    }
    else if (element.name === 'Include') {
      return element.name;
    }

    return '';
  }

  private _getNonTextChildren(element: xmldoc.XmlElement) {
    return element.children ? element.children.filter((e) => e.type === 'element' || e.type === 'comment') : [];
  }

  private _addChildren(current: INodeStackNode, isLeaf: boolean, stack: INodeStackNode[]) {
    if (current.element.type !== 'element') {
      return 0;
    }

    const depth = current.depth;
    const children = this._getNonTextChildren(current.element).map((e) => (
      { depth: depth + 1, element: e, property: isLeaf }
    ));

    // stop going deeper after parent was ModOp (aka this is property)
    if (children.length > 0 && !current.property) {
      stack.push(...children.reverse());
      return children.length;
    }
    return 0;
  }

  private _elementRangeName(element: xmldoc.XmlElement, doc: xml.AssetsDocument) {
    const position = doc.textLines.positionAt(element.startTagPosition);
    return new vscode.Range(position.line, position.column, position.line, position.column + element.name.length);
  }

  /// Return line number where the comment has occured. Max: 10 lines up.
  private _findCommentUp(document: xml.AssetsDocument, start: number, comment: string) {
    let line = start;
    let maxLineUp = Math.max(0, start - 9);
    for (; line >= maxLineUp; line--) {
      let text = document.textLineAt(line);
      if (text.includes(comment)) {
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
    if (!this._doc || !this._doc?.content || !this._doc.filePath) {
      return undefined;
    }

    const uri = vscode.Uri.file(this._doc.filePath);
    var toc: TocEntry[] = [];

    const relevantSections: { [index: string]: any } = {
      /* eslint-disable @typescript-eslint/naming-convention */
      // 'ModOps': { symbol: vscode.SymbolKind.Number },
      // 'Assets': { symbol: vscode.SymbolKind.Number },
      'ModOp': { symbol: vscode.SymbolKind.Class, isLeaf: true },
      'Group': { symbol: vscode.SymbolKind.Module },
      'Asset': { symbol: vscode.SymbolKind.Function, needsChildren: true },
      'Template': { symbol: vscode.SymbolKind.TypeParameter, needsChildren: true },
      'Include': { symbol: vscode.SymbolKind.File }
      /* eslint-enable @typescript-eslint/naming-convention */
    };


    var sectionComment: string | undefined = this._doc.content.name;
    var groupComment: string | undefined;

    const nodeStack: INodeStackNode[] = [];
    if (this._doc.content.name === 'ModOps' || this._doc.content.name === 'Assets') {
      this._addChildren({ depth: 0, element: this._doc.content, property: false }, false, nodeStack);
    }

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
        var tocRelevant = relevantSections[top.element.name];
        const children = this._getNonTextChildren(top.element);
        if (tocRelevant?.needsChildren && children.length === 0) {
          tocRelevant = undefined;
        }

        // open ModOp section
        if (sectionComment && tocRelevant) {
          const line = this._findCommentUp(this._doc, top.element.line, sectionComment);
          toc.push({
            text: sectionComment,
            detail: '',
            level: top.depth - 1,
            line,
            range: new vscode.Range(line, 0, line, 1),
            symbol: vscode.SymbolKind.Number
          });
          sectionComment = undefined;
        }

        // check if relevant, also ignore simple items
        if (tocRelevant || top.property) {
          if (tocRelevant) {
            this._addChildren(top, tocRelevant.isLeaf, nodeStack);
          }

          // TODO tagStartColumn is 0 for multiline tags, not correct but ...
          // const line = (groupComment && top.element.name === 'Group') ? this._findCommentUp(this._doc, top.element.line, groupComment) : top.element.line;

          var symbol = tocRelevant?.symbol ?? vscode.SymbolKind.String;
          const range = this._elementRangeName(top.element, this._doc);
          const line = range.start.line;

          // Text below ModOp
          if (top.element.name === 'Text' && top.property && top.element.childNamed('Text')) {
            const text = utils.ellipse(top.element.childNamed('Text')?.val, 35);

            toc.push({
              text: text || 'Text',
              detail: '',
              level: top.depth, line,
              guid: undefined,
              range,
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
              range,
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
              guid: xml.getAssetGUID(top.element),
              range, symbol
            });
          }
          // Non-Asset below ModOp
          else if (top.property && top.element && top.element.name !== 'Asset') {
            // try to get name from Item/ModItem first
            var name: string | undefined = undefined;
            if (top.element.name === 'Item' || top.element.name === 'ModItem') {
              const item = xml.firstLeafChild(top.element);
              if (item) {
                const asset = SymbolRegistry.resolve(item.val);
                name = (asset ? xml.english(asset) : item.val);
              }
            }

            toc.push({
              text: name || top.element.name,
              detail: name ? top.element.name : '',
              level: top.depth, line, guid: undefined, range,
              symbol: vscode.SymbolKind.Field
            });
          }
          // ModOp
          else if (top.element.name === 'ModOp') {
            toc.push({
              text: this._getName(top.element),
              detail: this._getDetail(top.element),
              level: top.depth, line, guid: undefined, range, symbol
            });
          }
          // anything else
          else {
            // const multiModOpCount = this._getMultiModOpCount(top.element);
            toc.push({
              text: this._getName(top.element, groupComment),
              detail: this._getDetail(top.element),
              level: top.depth, line,
              guid: xml.getAssetGUID(top.element),
              range, symbol
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
      const endLine = end ?? this._doc!.lineCount - 1;
      return {
        ...entry,
        range: new vscode.Range(
            entry.range.start,
            new vscode.Position(endLine, this._doc?.textLineAt(endLine)?.length ?? 0))
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