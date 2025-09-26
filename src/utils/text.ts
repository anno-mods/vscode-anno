
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
