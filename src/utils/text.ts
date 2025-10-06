
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

export class TextLines {
  private text: string;
  private lineStarts: number[] = [];
  private lineEnds: number[] = [];

  readonly length: number;

  constructor(src: string) {
    this.text = src;
    this.lineStarts.push(0);
    for (var i = 0; i < src.length;) {
      if (src[i] === '\r') {
        this.lineEnds.push(i);
        i += (src[i + 1] === '\n') ? 2 : 1;
        this.lineStarts.push(i);
      }
      else if (src[i] === '\n') {
        this.lineEnds.push(i);
        this.lineStarts.push(++i);
      }
      else {
        i++;
      }
    }
    this.lineEnds.push(src.length);

    this.length = this.lineStarts.length;
  }

  /** Return 0-based { line, column } for a 0-based character position. */
  positionAt(offset: number): { line: number; column: number } {
    if (offset < 0) {
      return { line: 0, column: 0 };
    }
    if (offset > this.text.length) {
      return { line: this.length - 1, column: this.lineEnds[this.length - 1] };
    }

    var lo = 0, hi = this.lineStarts.length - 1, line = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.lineStarts[mid] <= offset) {
        line = mid; lo = mid + 1;
      }
      else {
        hi = mid - 1;
      }
    }
    if (offset > this.lineEnds[line] && line + 1 < this.lineStarts.length) {
      line++;
    }
    return { line, column: offset - this.lineStarts[line] };
  }

  /** Return line (0-based), without newline chars. */
  lineAt(line: number): string | undefined {
    if (line < 0 || line >= this.lineStarts.length) {
      return undefined;
    }
    return this.text.slice(this.lineStarts[line], this.lineEnds[line]);
  }
}
