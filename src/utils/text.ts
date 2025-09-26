
export function findWord(line: string, text: string)
{
  const pos = line.indexOf(text);
  if (pos <= 0) {
    return false;
  }

  const charBefore = line.charAt(pos - 1);
  const charAfter = line.charAt(pos + text.length);

  return (charBefore === '\'' || charAfter === '\'' ||
    charBefore === '"' || charAfter === '"' ||
    charBefore === ',' && charAfter === ',');
}

/** Shorten text to fit into length */
export function ellipse(text: string | undefined, length: number) {
  if (!text || length < 6 || text.length <= length - 5) {
    return text;
  }
  return text.substring(0, length - 5) + ' [..]';
}

export function indexOfFirst(line: string, search1: string, search2: string, from = 0): [number, string] {
  const i1 = line.indexOf(search1, from);
  const i2 = line.indexOf(search2, from);

  if (i1 === -1) return [i2, search2];
  if (i2 === -1) return [i1, search1];
  return i1 < i2 ? [i1, search1] : [i2, search2];
}