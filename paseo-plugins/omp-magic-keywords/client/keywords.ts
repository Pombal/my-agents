// OMP's magic keywords and how its TUI finds and paints them, ported from oh-my-pi v18.12.2 (MIT):
// - word list and hues: packages/coding-agent/src/modes/magic-keywords.ts (MAGIC_KEYWORDS)
// - boundaries, gradient, shimmer: packages/tui/src/prompt/{magic-keywords,gradient-highlight}.ts,
//   packages/coding-agent/src/modes/components/custom-editor.ts (SHIMMER_PERIOD_MS)
// - code/markup masking: packages/tui/src/prompt/markdown-prose.ts (maskNonProse)
// Keep in step with OMP when it adds keywords or changes the matching rules.

export interface MagicKeyword {
  /** Exact lowercase trigger, matched only as standalone prose. */
  readonly word: string;
  /** HSL hue sweep `[from, to]` in degrees across the word; `to` may exceed 360 to wrap through red. */
  readonly hue: readonly [number, number];
}

export const MAGIC_KEYWORDS: readonly MagicKeyword[] = [
  { word: "ultrathink", hue: [0, 330] },
  { word: "orchestrate", hue: [150, 280] },
  { word: "workflowz", hue: [30, 150] },
  { word: "jevify", hue: [300, 420] },
];

/** Color stops swept across each word. */
export const STOPS = 60;
/** One full trip of the gradient across a word. */
export const SHIMMER_PERIOD_MS = 1800;
/**
 * Brighter than OMP's 90% / 62%: Paseo's dark bubbles are lighter than a terminal and sit next to
 * white text, where OMP's tones read as pastel.
 */
export const DARK_SATURATION = 100;
export const DARK_LIGHTNESS = 68;
/** OMP has no light variant; its tones are too pale on a light bubble. */
export const LIGHT_SATURATION = 90;
export const LIGHT_LIGHTNESS = 42;

export interface KeywordMatch {
  /** Index into {@link MAGIC_KEYWORDS}. */
  keyword: number;
  start: number;
  end: number;
}

/** Characters that bind a keyword into an identifier or path segment. */
const LEFT_BOUNDARY = String.raw`(?<![\p{L}\p{N}_./\\-])(?<!::)`;
/** Characters that cannot immediately follow a standalone keyword. */
const RIGHT_BOUNDARY = String.raw`(?![\p{L}\p{N}_/\\-])(?!\.[\p{L}\p{N}_-])(?!\()`;

// Built on first use: only the web runtime matches, and native engines may reject the syntax.
let patterns: RegExp[] | undefined;

/** Every keyword standing as prose in `text`: never inside code, fenced blocks or XML/HTML sections. */
export function findMagicKeywords(text: string): KeywordMatch[] {
  patterns ??= MAGIC_KEYWORDS.map(({ word }) => new RegExp(`${LEFT_BOUNDARY}${word}${RIGHT_BOUNDARY}`, "gu"));
  const matches: KeywordMatch[] = [];
  let masked: string | undefined;
  MAGIC_KEYWORDS.forEach(({ word }, keyword) => {
    if (!text.includes(word)) return;
    masked ??= maskNonProse(text);
    for (const match of masked.matchAll(patterns![keyword]!)) {
      matches.push({ keyword, start: match.index, end: match.index + match[0].length });
    }
  });
  return matches;
}

/**
 * Gradient stop for character `index` of an `length`-character word at `phase` ∈ [0, 1).
 * OMP's shimmer: the palette rotates as phase grows, so the colors run right to left.
 */
export function stopFor(index: number, length: number, phase: number): number {
  return Math.floor(((index / length + phase) % 1) * STOPS) % STOPS;
}

const TAG_NAME = /[A-Za-z][A-Za-z0-9-]*/y;
const FENCE = /^( {0,3})([`~]{3,})/;

function backtickRunEnd(text: string, i: number, n: number): number {
  let j = i;
  while (j < n && text[j] === "`") j++;
  return j;
}

/** Index past the closing backtick run of exactly `runLen`, or -1 (an unmatched run is literal text). */
function findBacktickClose(text: string, from: number, n: number, runLen: number, masked: Uint8Array): number {
  let k = from;
  while (k < n) {
    if (masked[k]) {
      k++;
      continue;
    }
    if (text[k] === "`") {
      const e = backtickRunEnd(text, k, n);
      if (e - k === runLen) return e;
      k = e;
      continue;
    }
    k++;
  }
  return -1;
}

/** Index of the `>` closing a tag whose attributes begin at `j`, honoring quotes; -1 when malformed. */
function findTagEnd(text: string, j: number, n: number): number {
  let quote = "";
  for (let k = j; k < n; k++) {
    const ch = text[k];
    if (quote) {
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ">") return k;
    if (ch === "<") return -1;
  }
  return -1;
}

/** Index past the `</name>` balancing an opening `<name>`, counting nesting; -1 when never closed. */
function findMatchingClose(text: string, start: number, n: number, name: string, masked: Uint8Array): number {
  const lname = name.toLowerCase();
  let depth = 1;
  let k = start;
  while (k < n) {
    if (masked[k] || text[k] !== "<") {
      k++;
      continue;
    }
    let m = k + 1;
    let isClose = false;
    if (text[m] === "/") {
      isClose = true;
      m++;
    }
    TAG_NAME.lastIndex = m;
    const nm = TAG_NAME.exec(text);
    if (!nm) {
      k++;
      continue;
    }
    const gt = findTagEnd(text, TAG_NAME.lastIndex, n);
    if (gt < 0) {
      k++;
      continue;
    }
    if (nm[0].toLowerCase() === lname) {
      if (isClose) {
        depth--;
        if (depth === 0) return gt + 1;
      } else if (text[gt - 1] !== "/") {
        depth++;
      }
    }
    k = gt + 1;
  }
  return -1;
}

/** Masks the comment, tag, or tag plus content starting at `<` (index `i`); returns the index past it. */
function maskTagAt(text: string, i: number, n: number, masked: Uint8Array): number {
  if (text.startsWith("<!--", i)) {
    const end = text.indexOf("-->", i + 4);
    const stop = end < 0 ? n : end + 3;
    for (let p = i; p < stop; p++) masked[p] = 1;
    return stop;
  }
  let j = i + 1;
  let closing = false;
  if (text[j] === "/") {
    closing = true;
    j++;
  }
  TAG_NAME.lastIndex = j;
  const nm = TAG_NAME.exec(text);
  if (!nm) return i;
  const gt = findTagEnd(text, TAG_NAME.lastIndex, n);
  if (gt < 0) return i;
  const tagEnd = gt + 1;
  const selfClosing = text[gt - 1] === "/";
  for (let p = i; p < tagEnd; p++) masked[p] = 1;
  if (closing || selfClosing) return tagEnd;
  const close = findMatchingClose(text, tagEnd, n, nm[0], masked);
  if (close < 0) return tagEnd;
  for (let p = tagEnd; p < close; p++) masked[p] = 1;
  return close;
}

/**
 * Same-length copy of `text` with fenced code blocks, inline code spans and HTML/XML sections
 * blanked to spaces (newlines kept), so a match on it never lands in code while its indices
 * still address `text`.
 */
function maskNonProse(text: string): string {
  if (!text.includes("`") && !text.includes("<") && !text.includes("~~~")) return text;
  const n = text.length;
  const masked = new Uint8Array(n);

  // Fenced code blocks, line by line.
  let fenceChar = "";
  let fenceLen = 0;
  let lineStart = 0;
  while (lineStart <= n) {
    let nl = text.indexOf("\n", lineStart);
    if (nl < 0) nl = n;
    const line = text.slice(lineStart, nl);
    const open = FENCE.exec(line);
    if (fenceChar) {
      for (let p = lineStart; p < nl; p++) masked[p] = 1;
      // A closing fence is the same char, at least as long, with nothing else on the line.
      if (open && open[2]![0] === fenceChar && open[2]!.length >= fenceLen && line.slice(open[1]!.length + open[2]!.length).trim() === "") {
        fenceChar = "";
        fenceLen = 0;
      }
    } else if (open) {
      const marker = open[2]!;
      const ch = marker[0]!;
      // A backtick fence's info string may not contain a backtick.
      if (!(ch === "`" && line.slice(open[1]!.length + marker.length).includes("`"))) {
        fenceChar = ch;
        fenceLen = marker.length;
        for (let p = lineStart; p < nl; p++) masked[p] = 1;
      }
    }
    if (nl === n) break;
    lineStart = nl + 1;
  }

  // Inline code spans and HTML/XML, over what is not masked yet.
  let i = 0;
  while (i < n) {
    if (masked[i]) {
      i++;
      continue;
    }
    const c = text[i];
    if (c === "`") {
      const runEnd = backtickRunEnd(text, i, n);
      const close = findBacktickClose(text, runEnd, n, runEnd - i, masked);
      if (close >= 0) {
        for (let p = i; p < close; p++) masked[p] = 1;
        i = close;
      } else {
        i = runEnd;
      }
      continue;
    }
    if (c === "<") {
      const end = maskTagAt(text, i, n, masked);
      i = end > i ? end : i + 1;
      continue;
    }
    i++;
  }

  const chars = text.split("");
  for (let p = 0; p < n; p++) {
    if (masked[p] && chars[p] !== "\n") chars[p] = " ";
  }
  return chars.join("");
}
