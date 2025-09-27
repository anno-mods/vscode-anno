import * as xmldoc from 'xmldoc';

import { SymbolRegistry } from '../../data/symbols';

export const PATH_ATTRIBUTES = new Set([
  'Path', 'Add', 'Merge', 'Replace', 'Append', 'Prepend', 'Remove'
]);

/** Read Path, Add, Merge, ...
 * @return [ attribute name, value ] */
export function getPathAttribute(element: xmldoc.XmlElement) {
  for (const key in element.attr) {
    if (PATH_ATTRIBUTES.has(key)) {
      return [ key, element.attr[key] ];
    }
  }
  return [ undefined, undefined ];
}

/** Read Values/Standard/GUID */
export function getAssetGUID(element: xmldoc.XmlElement) {
    if (element.name === 'Asset') {
      const guid = element.valueWithPath('Values.Standard.GUID');
      return guid;
    }
    return undefined;
}

/** Resolve template name. Uses SymbolRegistry for base assets.
 * @return [template name, base asset name] */
export function resolveTemplate(element: xmldoc.XmlElement) {
  if (element.name === 'Asset') {
    const template = element.valueWithPath('Template');
    if (template) {
      return [ template, undefined ];
    }
    const base = element.valueWithPath('BaseAssetGUID');
    if (base) {
      const resolvedGuid = SymbolRegistry.resolve(base);
      if (resolvedGuid) {
        return [ resolvedGuid.template, resolvedGuid.name ];
      }
      else {
        return [ undefined, base ];
      }
    }
  }

  return [ undefined, undefined ];
}

/** Return first child element that is a leaf (empty or only text) */
export function firstLeafChild(parent: xmldoc.XmlElement) {
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

/** Replace comments with spaces.
 * @param inside true if previous line left comment open
*/
export function removeComments(line: string, inside: boolean): [string, boolean, string] {
  let result = "";
  let inverse = "";
  let i = 0;

  while (i < line.length) {
    if (!inside) {
      const start = line.indexOf("<!--", i);
      if (start === -1) {
        result += line.slice(i);
        inverse += " ".repeat(line.length - i);
        break;
      }
      result += line.slice(i, start) + " ".repeat(4);
      inverse += " ".repeat(start - i + 4);
      i = start + 4;
      inside = true;
    }
    else {
      const end = line.indexOf("-->", i);
      if (end === -1) {
        result += " ".repeat(line.length - i);
        inverse += line.slice(i);
        i = line.length;
      }
      else {
        result += " ".repeat(end + 3 - i);
        inverse += line.slice(i, end) + " ".repeat(3);
        i = end + 3;
        inside = false;
      }
    }
  }

  return [result, inside, inverse];
}

export function getInvalidAttributes(element: xmldoc.XmlElement, allowed: (string | { name: string })[]) {
  const result: string[] = [];
  for (const attrib of Object.keys(element.attr)) {
    if (!allowed.find(e => (e as {name:string})?.name === attrib || e === attrib)) {
      result.push(attrib);
    }
  }

  return result;
}