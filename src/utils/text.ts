
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
