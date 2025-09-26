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