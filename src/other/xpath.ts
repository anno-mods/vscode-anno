
/** split by / */
export function split(xpath?: string): string[] {
  if (!xpath || xpath.length === 0) {
    return [];
  }

  let depth = 0;
  const parts: string[] = [];
  let buf = "";

  // Split on "/" but only when not inside predicates "[ ... ]"
  for (let i = 0; i < xpath.length; i++) {
    const ch = xpath[i];

    if (ch === "[") depth++;
    else if (ch === "]") depth = Math.max(0, depth - 1);

    if (ch === "/" && depth === 0) {
      if (buf.length) parts.push(buf);
      buf = "";
      continue;
    }

    buf += ch;
  }
  if (buf.length) {
    parts.push(buf);
  }

  return parts;
}

function removePredicate(element: string) {
  element = element.trim();

  const bracketIdx = element.indexOf("[");
  if (bracketIdx !== -1) {
    element = element.slice(0, bracketIdx).trim();
  }

  return element;
}

/** return last path element of an XPath exclusing predicates */
export function basename(xpath: string, dropPredicate: boolean = true, itemParent: boolean = false) {
  var parts = split(xpath);
  if (parts.length === 0) {
    return undefined;
  }

  var last = parts[parts.length - 1];
  if (dropPredicate) {
    last = removePredicate(last);
  }

  if (itemParent && last === 'Item' && parts.length > 1) {
    var parent = parts[parts.length - 2];
    last = `${(dropPredicate) ? removePredicate(parent) : parent}/${last}`;
  }

  return last;
}
