import * as fs from 'fs';
import * as xmldoc from 'xmldoc';

import * as logger from './logger';

type INodeMap = { [index: string]: xmldoc.XmlElement };

// lazy implementation of what I needed
// this needs some clean up and tests!

function _unquote(text: string) {
  const unquoted = text.trim();
  if ((unquoted.startsWith('\'') && unquoted.endsWith('\'')) ||
  (unquoted.startsWith('\"') && unquoted.endsWith('\"'))) {
    return unquoted.substring(1, unquoted.length - 1);
  }
  return unquoted;
}

class XPathCondition {
  readonly tag: string;
  readonly value: string;
  public constructor(condition: string) {
    const split = condition.split('=');
    this.tag = split[0].trim();
    if (split.length > 0) {
      this.value = _unquote(split[1]);
    }
    else {
      this.value = '';
    }
  }

  public toString() {
    return `${this.tag}='${this.value}'`;
  }
}

class XPathNode {
  readonly tag: string;
  readonly conditions: XPathCondition[];
  public constructor(path: string) {
    const match = path.match(/^([^\[\]\/]+)(\[[^\[\]]+\])?$/);
    this.tag = match ? match[1] : path;
    if (match && match[2]) {
      // support only ' and ' and ignore the rest
      const split = (match[2].substr(1, match[2].length - 2)).split(' and ');
      this.conditions = split.map((e) => new XPathCondition(e.trim()));
    }
    else {
      this.conditions = [];
    }
  }

  public toString() {
    if (this.conditions.length > 0) {
      return this.tag + '[' + this.conditions.join(' and ') + ']';
    }
    return this.tag;
  }
}

class XPath {
  // simplistic implementation of xpath
  readonly path: string;
  readonly nodes: XPathNode[];
  public constructor(path: string) {
    this.path = path;
    this.nodes = path.split('/').map((e) => new XPathNode(e));
  }
}

export class AnnoXmlElement {
  public _element: xmldoc.XmlElement;

  public constructor(element: xmldoc.XmlElement) {
    this._element = element;
  }

  public toString(): string {
    return this._element.toString({ compressed: true, preserveWhitespace: true, html: true });
  }

  public findElement(path: string, options?: { silent?: boolean, all?: boolean }): AnnoXmlElement | undefined {
    const result = this.findElements(path, { ...options, all: false });
    if (!result || result.length === 0) {
      return undefined;
    }
    return result[0];
  }

  public findElements(path: string, options?: { silent?: boolean, all?: boolean }): AnnoXmlElement[] | undefined {
    let originalPath = path.slice();
    if (!path.startsWith('//')) {
      if (path.startsWith('/')) {
        path = '/' + path;
      }
      else {
        path = '//' + path;
      }
    }
    
    let longestMatch: string[] = [];
    const found: xmldoc.XmlElement[] = [];
    const candidates: { nodes: XPathNode[], element: xmldoc.XmlElement, history: string[] }[] = [
      {
        nodes: new XPath(path.substr(2)).nodes,
        element: this._element,
        history: []
      }
    ];      

    while (candidates.length > 0 && (options?.all || found.length === 0)) {
      const candidate = candidates.pop()!; // most recent candidates first -> go deep first
      const remainingNodes = candidate.nodes.slice(); // make a copy
      const nextRemainingNode = remainingNodes.shift();
      if (!nextRemainingNode) { // we've matched the whole path
        found.push(candidate.element);
        if (options?.all) { continue; }
        break; // stop searching
      }

      // add all matching children paths in reverse order to candidates to keep most recent the first entry
      this._forEachWithCondition(candidate.element.children.slice().reverse(), nextRemainingNode, (element: xmldoc.XmlElement) => {
        candidates.push({ nodes: remainingNodes, element, history: [...candidate.history, nextRemainingNode.toString()] });
        return undefined; // continue to add all matching elemends
      });

      if (longestMatch.length - 1 < candidate.history.length) {
        longestMatch = [...candidate.history, nextRemainingNode.toString()];
      }
    }
    if (found.length === 0) {
      if (!options?.silent) {
        logger.warn(`cannot find element //${longestMatch.join('/')}`);
        if (!originalPath.startsWith('//')) {
          logger.warn(`${originalPath} was considered as ${path}`);
        }
      }
      return undefined;
    }
    
    return found.map((e) => new AnnoXmlElement(e));
  }

  public createChild(name: string, options?: { after?: string[] }) {
    return new AnnoXmlElement(_createXmlElement(this._element, name, undefined, options));
  }

  public fill(name: string, values: any[], options?: { clear?: boolean }) {
    if (options?.clear) {
      this._element.children = [];
      this._element.firstChild = null;
      this._element.lastChild = null;
    }
    for (let value of values) {
      const node = new AnnoXmlElement(_createXmlElement(this._element, name));
      node.set(value);
    }
  }

  public remove(path: string, options?: { all?: boolean, silent?: boolean }) {
    const parentPathElements = (new XPath(path.substr(2))).nodes;
    const toRemove = parentPathElements.pop();
    if (!toRemove) {
      if (!options?.silent) {
        logger.warn(`nothing to remove with '${path}'`);
      }
      return;
    }
    const parentPath = parentPathElements.map((e: XPathNode) => e.toString()).join('/');

    const parent = this.findElement(parentPath);
    if (!parent) {
      return;
    }

    let removed = false;
    this._forEachWithCondition(parent._element.children, toRemove, (e, idx) => {
      const lineStartIdx = _findLineStart(parent._element, idx);
      const nextLineIdx = _findLineEnd(parent._element, idx);
      parent._element.children.splice(lineStartIdx, nextLineIdx - lineStartIdx + 1);
      parent._element.firstChild = parent._element.children && parent._element.children[0];
      parent._element.lastChild = parent._element.children && parent._element.children[parent._element.children.length - 1];
      removed = true;
      return options?.all ? lineStartIdx : -1; // break the loop if not all
    });

    if (!removed && !options?.silent) {
      logger.warn(`could not find and remove ${path}`);
    }
  }

  public set(values: any, options?: { defaults?: any, keepUnderscore?: boolean }) {
    if (values === undefined) {
      return;
    }
    if (typeof values === 'string' || typeof values === 'number') {
      console.error(`Text is not supported in AnnoXmlElement.set (${values})`);
      console.error(this._element.name);
      return;
    }
    else if (Array.isArray(values)) {
      console.error(`Arrays are not supported in AnnoXmlElement.set`);
      console.error(this._element.name);
      return;
    }
    else {
      // first merge the keys, defaults first to get the correct order
      const keys = (options?.defaults&&Object.keys(options.defaults)||[]);
      for (let key of Object.keys(values)) {
        if (keys.indexOf(key) === -1) {
          keys.push(key);
        }
      }

      for (let key of keys) {
        const xmlKeyName = options?.keepUnderscore ? key : key.replace('_', '.');
        let targetElement = this._element.childNamed(xmlKeyName);
        const elementDefaults = options?.defaults && options?.defaults[key];
        const elementValues = values[key];

        // if key doesn't exist, create with defaults
        if (!targetElement) {
          let textValue = (typeof elementDefaults === 'string' || typeof elementDefaults === 'number') ? elementDefaults.toString() : undefined;
          targetElement = _createXmlElement(this._element, xmlKeyName, textValue);
          if (elementDefaults && !textValue) {
            new AnnoXmlElement(targetElement).set(elementDefaults, { keepUnderscore: options?.keepUnderscore });
          }
        }

        if (elementValues !== undefined) {
          if (typeof elementValues === 'string' || typeof elementValues === 'number') {
            _setXmlElementVal(this._element, xmlKeyName, elementValues.toString());
          }
          else if (Array.isArray(elementValues)) {
            _setXmlElementArray(this._element, xmlKeyName, elementValues);
          }
          else if (Object.keys(elementValues)?.length > 0) {
            let firstChild = this._element.childNamed(xmlKeyName);
            if (!firstChild) {
              firstChild = _createXmlElement(this._element, xmlKeyName);
            }
            new AnnoXmlElement(firstChild).set(elementValues, { keepUnderscore: options?.keepUnderscore });
          }
          else {
            console.error('trying to write something odd');
          }
        }
        else {
          // skip undefined values
        }
      }
    }
  }

  private _forEachWithCondition(array: xmldoc.XmlNode[], xpathNode: XPathNode, callback: (e: xmldoc.XmlElement, idx: number) => number | undefined) {
    for (let idx = 0; idx < array.length; idx++) {
      const child = array[idx];
      if (child.type !== 'element' || child.name !== xpathNode.tag) {
        continue;
      }

      let conditionsMet = true;
      for (let condition of xpathNode.conditions) {
        if ((child.childNamed(condition.tag)?.firstChild as xmldoc.XmlTextNode)?.text !== condition.value) {
          conditionsMet = false;
          break;
        }
      }
      if (conditionsMet) {
        const nextIdx = callback(child, idx);
        if (nextIdx === -1) {
          break;
        }
        if (nextIdx !== undefined) {
          idx = nextIdx - 1; // elements have been removed, rescan starting from nextIdx
        }
      }
    }
  }
}

export default class AnnoXml {
  private xml: xmldoc.XmlDocument;
  private nodes: INodeMap;

  public static fromFile(filePath: string) {
    return AnnoXml.fromString(fs.readFileSync(filePath, 'utf8').toString());
  }

  public static fromString(text: string) {
    const xml = new xmldoc.XmlDocument('<root>\n' + text + '\n</root>');

    const nodes: INodeMap = {};
    AnnoXml._scanNodes(xml, nodes);
    return new AnnoXml(xml, nodes);
  }

  // deprecated
  public setValue(nodeName: string, values: any, options?: { insert: string, defaults: any }) {
    const optionsInsert = options?.insert;
    let node = this.nodes[nodeName];
    let newNode = false;
    
    if (!node && optionsInsert) {
      const parent = this._firstNode(optionsInsert);
      if (parent) {
        node = _createXmlElement(parent, 'Config');
        newNode = true;
      }
      else {
        // TODO create parent if not there?
      }
    }
    
    if (!node) {
      return;
    }

    // only apply defaults for new nodes
    let insertValues = { ...(newNode&&options?.defaults||{}), ...values };
    this._setValue(node, insertValues);
  }

  public setArray(path: string, name: string, values: any[]) {
    const parent = this._firstNode(path);
    if (parent) {
      // clear out parent
      parent.children = [];
      parent.firstChild = null;
      parent.lastChild = null;
      // refill
      for (let value of values) {
        const node = _createXmlElement(parent, name);
        this._setValue(node, value);
      }
    }
    else {
      console.warn(`${path} not found`);
    }
  }

  public set(xpath: string, values: any, options?: { defaults?: any, all?: boolean, keepUnderscore?: boolean }) {
    const elements = this.findElements(xpath, { all: options?.all });
    if (!elements || elements.length === 0) {
      return false;
    }

    if (options?.all) {
      for (let entry of elements) {
        entry.set(values, options);
      }
    }
    else {
      elements[0].set(values, options);
    }
    return true;
  }

  public createChild(path: string) {
    const doc = new AnnoXmlElement(this.xml as xmldoc.XmlElement);
    return doc.createChild(path);
  }

  public remove(path: string, options?: { all?: boolean, silent?: boolean }) {
    const doc = new AnnoXmlElement(this.xml as xmldoc.XmlElement);
    return doc.remove(path, options);
  }

  public toString(): string {
    const xmlString = this.xml.toString({ compressed: true, preserveWhitespace: true, html: true });
    return xmlString.substr('<root>\n'.length, xmlString.length - '<root>\n'.length * 2 - 1);
  }

  public getNodeNames(condition: (value: string) => boolean) {
    return Object.keys(this.nodes).filter(condition);
  }

  public ensureSection(path: string, inserts: (any)[]) {
    const pathElements = path.split('.');
    let node: xmldoc.XmlElement | undefined = this.xml;
    for (let i = 0; i < pathElements.length && node; i++) {
      const parent = node;
      node = node.childNamed(pathElements[i] as string);
      if (!node) {
        // create
        let insert = inserts[i]?.position;
        if (insert) {
          const position = insert.split(':')[1];
          insert = insert.split(':')[0];
          if (position === 'after') {
            // after tag with name of insert
            let insertAfterThis = parent.childNamed(insert);
            if (insertAfterThis) {
              node = this._insertAfterXmlElement(parent, insertAfterThis, pathElements[i]);
            }
            else {
              console.warn('element not found ' + insert);
            }
          }
          else {
            console.warn('unknown position ' + position);
          }
        }
        else {
          // just as last child
          node = _setXmlElementVal(parent, pathElements[i], '');
        }

        if (node && inserts[i]?.defaults) {
          this._setValue(node, inserts[i].defaults);
        }
      }
    }
    return node;
  }

  private constructor(xml: xmldoc.XmlDocument, nodes: INodeMap) {
    this.xml = xml;
    this.nodes = nodes;
  }

  private static _scanNodes(node: xmldoc.XmlElement, nodes: INodeMap) {
    if (node.type !== 'element') {
      return;
    }

    const nodeName = node.childNamed('Name');
    if (nodeName && nodeName.val.toString().trim()) {
      // TODO name collision warning
      nodes[nodeName.val] = node;
    }

    for (let child of node.children) {
      if (child.type === 'element') {
        this._scanNodes(child as xmldoc.XmlElement, nodes);
      }
    }
  }

  private _firstNode(path: string, create?: string) {
    const pathElements = path.split('.');
    let node: xmldoc.XmlElement | undefined = this.xml;
    while (pathElements.length > 0 && node) {
      node = node.childNamed(pathElements.shift() as string);
    }
    return node;
  }

  public findElement(path: string, options?: { silent?: boolean }) {
    const doc = new AnnoXmlElement(this.xml as xmldoc.XmlElement);
    return doc.findElement(path, options);
  }

  public findElements(path: string, options?: { silent?: boolean, all?: boolean }) {
    const doc = new AnnoXmlElement(this.xml as xmldoc.XmlElement);
    return doc.findElements(path, options);
  }

  private _insertAfterXmlElement(parent: xmldoc.XmlElement, relative: xmldoc.XmlElement, tag: string) {
    const template = new xmldoc.XmlDocument(`<xml><${tag}></${tag}>\n</xml>`);
    const node = template.children[0] as xmldoc.XmlElement;
    const linebreak = template.children[1] as xmldoc.XmlTextNode;

    const column = parent.column - (parent.position - parent.startTagPosition + 1);

    const position = parent.children.indexOf(relative);
    if (position >= 0) {
      linebreak.text = (parent.children[position + 1] as xmldoc.XmlTextNode)?.text || '\n';
      node.column = column + tag.length + 2;
      node.position = tag.length;
      node.startTagPosition = 1;
      parent.children.splice(position + 2, 0, node, linebreak);
      parent.firstChild = parent.children[0];
      parent.lastChild = parent.children[parent.children.length - 1];
    }

    return node;
  }

  public _setValue(node: xmldoc.XmlElement, values: any) {
    const element = new AnnoXmlElement(node);
    element.set(values);
  }
}

function _createXmlElement(parent: xmldoc.XmlElement, tag: string, value?: string|number, options?: { after?: string[] }): xmldoc.XmlElement {
  // TODO now this is hacky, I definitely need to just directly use sax instead of xmldoc
  const template = new xmldoc.XmlDocument(`<xml> <${tag}>${value!==undefined?value:''}</${tag}>\n</xml>`);
  const indentation = template.children[0] as xmldoc.XmlTextNode;
  const node = template.children[1] as xmldoc.XmlElement;
  const linebreak = template.children[2] as xmldoc.XmlTextNode;

  // parent.column is where the tag ends, a bit odd...
  const column = parent.column - (parent.position - parent.startTagPosition + 1);

  indentation.text = '  ';
  linebreak.text = linebreak.text + ' '.repeat(column);
  if (parent.children.length <= 1) {
    // start with line break
    indentation.text = '\n' + ' '.repeat(column + 2);
    linebreak.text = '\n' + ' '.repeat(column);
  }
  node.column = column + tag.length + 2;
  node.position = tag.length;
  node.startTagPosition = 1;

  // try to insert after listed nodes
  let insertAfter = -1;
  if (options?.after) {
    for (let after of options.after) {
      insertAfter = _findLast(parent, after);
      if (insertAfter !== -1) {
        break;
      }
    }
    if (insertAfter >= 0) {
      insertAfter = _findLineEnd(parent, insertAfter) + 1;
      if (insertAfter >= parent.children.length || insertAfter === 0) {
        insertAfter = -1;
      }
      else 
      {
        parent.children = [...parent.children.slice(0, insertAfter), linebreak, indentation, node, ...parent.children.slice(insertAfter)];
      }
    }
  }

  // simply append otherwise, or as fallback
  if (insertAfter === -1) {
    parent.children.push(indentation);
    parent.children.push(node);
    parent.children.push(linebreak);
  }

  parent.firstChild = parent.children[0];
  parent.lastChild = parent.children[parent.children.length - 1];
  return node;
}

function _setXmlElementVal(node: xmldoc.XmlElement, key: string, value: string) {
  const property = node.childNamed(key);
  if (!property) {
    return _createXmlElement(node, key, value);
  }
  else {
    if (property.children.length === 0) {
      // note the space prefix, it's needed otherwise value='' will not create a text node
      const template = new xmldoc.XmlDocument(`<xml> ${value}</xml>`);
      const simpleText = template.children[0] as xmldoc.XmlTextNode;
      simpleText.text = simpleText.text.substr(1);
      property.children.push(simpleText);
      property.firstChild = property.children[0];
      property.lastChild = property.children[0];
    }
    else if (property.firstChild?.type === 'text') {
      (property.firstChild as xmldoc.XmlTextNode).text = value;
    }
    else {
      console.error(`can't set values to complex elements`);
      console.error(node);
    }
    return property;
  }
}

function _setXmlElementArray(node: xmldoc.XmlElement, key: string, values: any[]) {
  console.error(values);
  if (node.children.length > 0) {
    node.children = [];
    node.firstChild = null;
    node.lastChild = null;
  }

  // refill
  for (let value of values) {
    _createXmlElement(node, key, value);
  }
}

/** find previous newline, or first element before previous element */
function _findLineStart(parent: xmldoc.XmlElement, start: number) {
  let pos = start;
  do {
    pos--;
  } while (pos >= 0 && (
    parent.children[pos].type === 'comment' || 
    (parent.children[pos].type === 'text' && (parent.children[pos] as xmldoc.XmlTextNode).text.indexOf('\n') === -1 && (parent.children[pos] as xmldoc.XmlTextNode).text !== '')
    ));
  if (pos < 0 || parent.children[pos]?.type === 'element') {
    // include newline, but exclude next element
    pos++;
  }
  return pos;
}

/** find last node excluding newline, or last node before next element */ 
function _findLineEnd(parent: xmldoc.XmlElement, start: number) {
  let pos = start + 1;
  while (pos < parent.children.length && (
    parent.children[pos].type === 'comment' || 
    (parent.children[pos].type === 'text' && (parent.children[pos] as xmldoc.XmlTextNode).text.indexOf('\n') === -1 && (parent.children[pos] as xmldoc.XmlTextNode).text !== '')
    )) {
    pos++;
  }
  return pos - 1;
}

/** find last element */
function _findLast(parent: xmldoc.XmlElement, name: string) {
  for (let idx = parent.children.length - 1; idx >= 0; idx--) {
    if (parent.children[idx].type === 'element' && (parent.children[idx] as xmldoc.XmlElement).name === name) {
      return idx;
    }
  }
  return -1;
}