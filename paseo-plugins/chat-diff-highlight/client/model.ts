// Pure diff detection, parsing and tokenizing. No DOM, no React: offsets index the code block's text.

export type TokenKind =
  | "keyword"
  | "comment"
  | "string"
  | "number"
  | "literal"
  | "function"
  | "type"
  | "tag"
  | "attribute"
  | "property"
  | "operator"
  | "addSign"
  | "delSign"
  | "header"
  | "hunk";

export type LineKind = "add" | "del" | "ctx" | "header" | "hunk" | "note";

export interface Span {
  start: number;
  end: number;
  kind: TokenKind;
}

export interface DiffLine {
  start: number;
  end: number;
  kind: LineKind;
}

export interface DiffModel {
  lines: DiffLine[];
  spans: Span[];
}

const DIFF_FENCES: Record<string, true> = { diff: true, patch: true, udiff: true };

/**
 * Whether a fenced block is a diff. Labeled `diff`/`patch` fences always are. Unlabeled fences need
 * git structure (`@@ -1`, `diff --git`, a `---`/`+++` pair) or every line shaped like a diff row with
 * at least one addition and one removal. Fences labeled with any other language are left alone.
 */
export function isDiffBlock(language: string | null, text: string): boolean {
  const lang = (language ?? "").trim().split(/\s+/)[0]!.toLowerCase();
  if (DIFF_FENCES[lang] === true) return true;
  if (lang) return false;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^@@ -\d/.test(line) || line.startsWith("diff --git ")) return true;
    if (line.startsWith("--- ") && lines[i + 1]?.startsWith("+++ ")) return true;
  }
  let adds = 0;
  let dels = 0;
  for (const line of lines) {
    if (line === "") continue;
    if (line[0] === "+") adds++;
    else if (line[0] === "-") dels++;
    else if (line[0] !== " ") return false;
  }
  return adds > 0 && dels > 0;
}

// ---------------------------------------------------------------- languages

interface Lang {
  lineComments: string[];
  /** `#` comments only at a word boundary (shell, YAML), so `$#` and `a#b` stay code. */
  hashAtWordStart?: boolean;
  blockComments: Array<[string, string]>;
  quotes: string;
  keywords: Record<string, true>;
  literals: Record<string, true>;
  /** PascalCase identifiers are types. */
  pascalTypes?: boolean;
  /** `<tag attr=...>` markup. */
  tags?: boolean;
  /** `key:` (YAML) or `key =` (TOML/INI) at line start is a property. */
  lineKeys?: ":" | "=";
  /** `"key":` strings are properties (JSON). */
  jsonKeys?: boolean;
  markdown?: boolean;
}

const words = (s: string) => Object.fromEntries(s.split(" ").map((w) => [w, true])) as Record<string, true>;

const C_KEYWORDS = words(
  "abstract as async await break case catch class const continue debugger declare def default defer delete do else enum export extends final finally fn for from func function go goto if impl implements import in instanceof interface internal let loop match mod module move mut namespace new of operator override package private protected pub public readonly return satisfies sealed select static struct super switch throw throws trait try type typeof unsafe use using var virtual void where while with yield chan map range fallthrough val fun object when is lateinit sizeof typedef union extern register volatile inline",
);
const C_LITERALS = words("true false null undefined nil None True False this self Self NaN Infinity iota");
const PY_KEYWORDS = words(
  "and as assert async await break case class continue def del elif else except finally for from global if import in is lambda match nonlocal not or pass raise return try while with yield",
);
const SH_KEYWORDS = words(
  "if then else elif fi for in do done while until case esac function return export local readonly declare set unset source alias exit shift trap eval exec sudo echo cd",
);
const RUBY_KEYWORDS = words(
  "alias and begin break case class def defined do else elsif end ensure for if in module next not or redo rescue retry return super then undef unless until when while yield require require_relative attr_accessor attr_reader private protected public",
);
const SQL_KEYWORDS = words(
  "select from where and or not insert into values update set delete create table index view drop alter add column primary key foreign references join left right inner outer full on group by order having limit offset as distinct union all case when then else end is null like in exists between returning with default constraint unique begin commit rollback transaction SELECT FROM WHERE AND OR NOT INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE INDEX VIEW DROP ALTER ADD COLUMN PRIMARY KEY FOREIGN REFERENCES JOIN LEFT RIGHT INNER OUTER FULL ON GROUP BY ORDER HAVING LIMIT OFFSET AS DISTINCT UNION ALL CASE WHEN THEN ELSE END IS NULL LIKE IN EXISTS BETWEEN RETURNING WITH DEFAULT CONSTRAINT UNIQUE BEGIN COMMIT ROLLBACK TRANSACTION",
);
const LUA_KEYWORDS = words("and break do else elseif end for function goto if in local not or repeat return then until while");
const NONE: Record<string, true> = {};

const C_LIKE: Lang = {
  lineComments: ["//"],
  blockComments: [["/*", "*/"]],
  quotes: "\"'`",
  keywords: C_KEYWORDS,
  literals: C_LITERALS,
  pascalTypes: true,
};
const LANGS = {
  c: C_LIKE,
  jsx: { ...C_LIKE, tags: true },
  python: { lineComments: ["#"], blockComments: [], quotes: "\"'", keywords: PY_KEYWORDS, literals: C_LITERALS, pascalTypes: true },
  ruby: { lineComments: ["#"], blockComments: [], quotes: "\"'", keywords: RUBY_KEYWORDS, literals: C_LITERALS, pascalTypes: true },
  shell: { lineComments: ["#"], hashAtWordStart: true, blockComments: [], quotes: "\"'", keywords: SH_KEYWORDS, literals: words("true false") },
  yaml: { lineComments: ["#"], hashAtWordStart: true, blockComments: [], quotes: "\"'", keywords: NONE, literals: words("true false null yes no on off ~"), lineKeys: ":" },
  toml: { lineComments: ["#", ";"], blockComments: [], quotes: "\"'", keywords: NONE, literals: words("true false"), lineKeys: "=" },
  json: { lineComments: ["//"], blockComments: [["/*", "*/"]], quotes: "\"", keywords: NONE, literals: words("true false null"), jsonKeys: true },
  css: { lineComments: ["//"], blockComments: [["/*", "*/"]], quotes: "\"'", keywords: words("important media import supports keyframes from to and not only"), literals: NONE },
  markup: { lineComments: [], blockComments: [["<!--", "-->"]], quotes: "\"'", keywords: NONE, literals: NONE, tags: true },
  sql: { lineComments: ["--"], blockComments: [["/*", "*/"]], quotes: "'\"", keywords: SQL_KEYWORDS, literals: words("true false TRUE FALSE NULL null") },
  lua: { lineComments: ["--"], blockComments: [], quotes: "\"'", keywords: LUA_KEYWORDS, literals: words("true false nil self") },
  markdown: { lineComments: [], blockComments: [["<!--", "-->"]], quotes: "", keywords: NONE, literals: NONE, markdown: true },
} satisfies Record<string, Lang>;
export type LangId = keyof typeof LANGS;

const EXTENSIONS: Record<string, LangId> = {};
const register = (id: LangId, exts: string) => exts.split(" ").forEach((e) => (EXTENSIONS[e] = id));
register("c", "js mjs cjs ts mts cts java c h cc cpp cxx hpp hh cs go rs swift kt kts scala dart php groovy gradle zig sol proto m mm v glsl hlsl wgsl");
register("jsx", "jsx tsx");
register("python", "py pyi pyw");
register("ruby", "rb rake gemspec");
register("shell", "sh bash zsh fish ps1 bats envrc env dockerfile makefile mk nix ex exs r");
register("yaml", "yml yaml");
register("toml", "toml ini cfg conf properties");
register("json", "json jsonc json5 jsonl");
register("css", "css scss less sass");
register("markup", "html htm xml svg vue svelte astro xhtml plist");
register("sql", "sql");
register("lua", "lua hs elm");
register("markdown", "md mdx markdown");

/** Language for a file path from a diff header, or undefined when the extension is unknown. */
export function langFromPath(path: string): LangId | undefined {
  const name = path.trim().split(/[\\/]/).pop()!.toLowerCase();
  const special = name === "dockerfile" || name === "makefile" || name.startsWith(".env") ? "shell" : undefined;
  if (special) return special;
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? EXTENSIONS[name.slice(dot + 1)] : undefined;
}

/** Guess for diffs without a file header. C-like is a fair default for most mock diffs. */
export function sniffLang(code: string): LangId {
  if (/^\s*(def |elif |from \S+ import |import \w+$|class \w+(\(.*\))?:$)/m.test(code)) return "python";
  if (/^\s*(#!\/|\$ |(sudo|export|echo|cd|npm|pnpm|git|paseo) )/m.test(code)) return "shell";
  if (/^\s*<\/?[A-Za-z][\w.-]*[\s>]/m.test(code) && !/[;{]\s*$/m.test(code)) return "markup";
  if (/^\s*[\w-]+:(\s|$)/m.test(code) && !/[;{}()]/.test(code)) return "yaml";
  if (/^\s*"[^"]+"\s*:/m.test(code)) return "json";
  return /<[A-Z][\w.]*[\s/>]/.test(code) ? "jsx" : "c";
}

// ---------------------------------------------------------------- tokenizer

/** Carries an open block comment from one line to the next on the same side of the diff. */
export interface TokenState {
  blockEnd?: string;
}

const IDENT = /[A-Za-z_$][\w$]*/y;
const NUMBER = /(?:0[xX][\da-fA-F_]+|0[bB][01_]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?)[a-zA-Z]*/y;
const OPERATOR = /[=+\-*/<>!&|?:%^~]+/y;

/** Appends spans for `line` (whose first char sits at `base` in the block text). */
export function tokenizeLine(lang: Lang, line: string, base: number, state: TokenState, out: Span[]): void {
  const push = (start: number, end: number, kind: TokenKind) => {
    if (end > start) out.push({ start: base + start, end: base + end, kind });
  };
  let i = 0;
  if (state.blockEnd) {
    const close = line.indexOf(state.blockEnd);
    if (close < 0) return push(0, line.length, "comment");
    push(0, close + state.blockEnd.length, "comment");
    i = close + state.blockEnd.length;
    state.blockEnd = undefined;
  }
  if (lang.markdown) {
    const heading = /^#{1,6}\s/.exec(line);
    if (heading) return push(0, line.length, "function");
  }
  if (lang.lineKeys && i === 0) {
    const key = lang.lineKeys === ":" ? /^(\s*(?:-\s+)?)([\w.-]+|"[^"]*"|'[^']*')(?=\s*:(\s|$))/.exec(line) : /^(\s*)([\w.-]+|"[^"]*")(?=\s*=)/.exec(line);
    if (key) {
      push(key[1]!.length, key[0].length, "property");
      i = key[0].length;
    } else if (lang.lineKeys === "=" && /^\s*\[.*\]\s*$/.test(line)) {
      return push(0, line.length, "type");
    }
  }
  let inTag = false;
  while (i < line.length) {
    const ch = line[i]!;
    const lineComment = lang.lineComments.find((c) => line.startsWith(c, i));
    if (lineComment && (!lang.hashAtWordStart || lineComment !== "#" || i === 0 || /\s/.test(line[i - 1]!))) {
      return push(i, line.length, "comment");
    }
    const block = lang.blockComments.find(([open]) => line.startsWith(open, i));
    if (block) {
      const close = line.indexOf(block[1], i + block[0].length);
      if (close < 0) {
        state.blockEnd = block[1];
        return push(i, line.length, "comment");
      }
      push(i, close + block[1].length, "comment");
      i = close + block[1].length;
      continue;
    }
    if (lang.markdown && ch === "`") {
      const close = line.indexOf("`", i + 1);
      const end = close < 0 ? line.length : close + 1;
      push(i, end, "string");
      i = end;
      continue;
    }
    if (lang.quotes.includes(ch)) {
      let j = i + 1;
      while (j < line.length && line[j] !== ch) j += line[j] === "\\" ? 2 : 1;
      const end = Math.min(j + 1, line.length);
      push(i, end, lang.jsonKeys && /^\s*:/.test(line.slice(end)) ? "property" : "string");
      i = end;
      continue;
    }
    if (lang.tags && ch === "<" && /^<\/?[A-Za-z]/.test(line.slice(i, i + 3))) {
      const name = /^<\/?([A-Za-z][\w.:-]*)/.exec(line.slice(i))!;
      push(i + name[0].length - name[1]!.length, i + name[0].length, "tag");
      i += name[0].length;
      inTag = true;
      continue;
    }
    if (inTag && ch === ">") {
      inTag = false;
      i++;
      continue;
    }
    if (/\d/.test(ch) && (i === 0 || !/[\w$]/.test(line[i - 1]!))) {
      NUMBER.lastIndex = i;
      const m = NUMBER.exec(line);
      if (m) {
        push(i, i + m[0].length, "number");
        i += m[0].length;
        continue;
      }
    }
    IDENT.lastIndex = i;
    const ident = /[A-Za-z_$]/.test(ch) ? IDENT.exec(line) : null;
    if (ident) {
      const word = ident[0];
      const end = i + word.length;
      const prev = line.slice(0, i).trimEnd();
      let kind: TokenKind | undefined;
      if (inTag && /^\s*=/.test(line.slice(end))) kind = "attribute";
      else if (lang.keywords[word] === true && !prev.endsWith(".")) kind = "keyword";
      else if (lang.literals[word] === true) kind = "literal";
      else if (/^\s*\(/.test(line.slice(end)) && !lang.markdown) kind = "function";
      else if (prev.endsWith(".") && !prev.endsWith("..") && lang.pascalTypes) kind = "property";
      else if (lang.pascalTypes && /^[A-Z][a-z0-9]\w*$/.test(word)) kind = "type";
      if (kind) push(i, end, kind);
      i = end;
      continue;
    }
    if (!lang.markdown) {
      OPERATOR.lastIndex = i;
      const op = OPERATOR.exec(line);
      if (op) {
        push(i, i + op[0].length, "operator");
        i += op[0].length;
        continue;
      }
    }
    i++;
  }
}

// ---------------------------------------------------------------- diff parsing

const FILE_META = /^(diff --git |index [0-9a-f]+\.\.[0-9a-f]+|(new|deleted) file mode |old mode |new mode |similarity index |dissimilarity index |rename (from|to) |copy (from|to) |Binary files |\*\*\* (Begin|End) Patch|Index: |={3,}$)/;
const PATCH_FILE = /^\*\*\* (?:Update|Add|Delete) File: (.+)$/;

function headerPath(line: string): string | undefined {
  const git = /^diff --git a\/(\S+) b\/(\S+)/.exec(line);
  if (git) return git[2];
  const patch = PATCH_FILE.exec(line);
  if (patch) return patch[1];
  const index = /^Index: (.+)$/.exec(line);
  if (index) return index[1];
  const unified = /^(?:---|\+\+\+) (?:[ab]\/)?([^\t]+?)(?:\t.*)?$/.exec(line);
  if (unified && unified[1] !== "/dev/null") return unified[1];
  return undefined;
}

/** Classifies each line of a diff block and colors its code by the file's language. */
export function parseDiff(text: string): DiffModel {
  const rows = text.split("\n");
  const kinds: LineKind[] = rows.map((line, i) => {
    if (FILE_META.test(line) || PATCH_FILE.test(line)) return "header";
    if (line.startsWith("--- ") && rows[i + 1]?.startsWith("+++ ")) return "header";
    if (line.startsWith("+++ ") && rows[i - 1]?.startsWith("--- ")) return "header";
    if (line.startsWith("@@")) return "hunk";
    if (line.startsWith("\\ ")) return "note";
    if (line[0] === "+") return "add";
    if (line[0] === "-") return "del";
    return "ctx";
  });

  // A diff that names its files colors each file by extension (unknown extensions stay plain);
  // a headerless mock diff is sniffed once from its code.
  const named = rows.some((line, i) => kinds[i] === "header" && headerPath(line) !== undefined);
  const code = rows.filter((_, i) => kinds[i] !== "header" && kinds[i] !== "hunk").map((l) => l.slice(1));
  let lang: Lang | undefined = named ? undefined : LANGS[sniffLang(code.join("\n"))];
  let oldState: TokenState = {};
  let newState: TokenState = {};
  const tokenize = (body: string, at: number, state: TokenState) => {
    if (lang) tokenizeLine(lang, body, at, state, spans);
  };

  const lines: DiffLine[] = [];
  const spans: Span[] = [];
  let offset = 0;
  rows.forEach((line, i) => {
    const kind = kinds[i]!;
    const start = offset;
    offset += line.length + 1;
    lines.push({ start, end: start + line.length, kind });
    if (kind === "header") {
      const path = headerPath(line);
      if (path) {
        const next = langFromPath(path);
        lang = next ? LANGS[next] : undefined;
        oldState = {};
        newState = {};
      }
      spans.push({ start, end: start + line.length, kind: "header" });
      return;
    }
    if (kind === "hunk") {
      const close = line.indexOf("@@", 2);
      const end = close < 0 ? line.length : close + 2;
      spans.push({ start, end: start + end, kind: "hunk" });
      if (end < line.length) tokenize(line.slice(end), start + end, {});
      oldState = {};
      newState = {};
      return;
    }
    if (kind === "note") {
      spans.push({ start, end: start + line.length, kind: "header" });
      return;
    }
    if (kind === "add" || kind === "del") {
      spans.push({ start, end: start + 1, kind: kind === "add" ? "addSign" : "delSign" });
      tokenize(line.slice(1), start + 1, kind === "add" ? newState : oldState);
      return;
    }
    const body = line.startsWith(" ") ? 1 : 0;
    tokenize(line.slice(body), start + body, newState);
    oldState = { ...newState };
  });
  return { lines, spans };
}
