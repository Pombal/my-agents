import type { EditKind, LineKind, TokenKind } from "./model";

// Colors copied from Paseo 0.11.4 so diff blocks match its own code blocks and git diff view:
// syntax palettes from packages/highlight/src/themes.ts + colors.ts (Settings → Appearance → Syntax
// theme), status colors from packages/app/src/styles/theme.ts. Row tints start from
// git/diff-document/palette.ts and are a step stronger (see diffPalette).

export type Scheme = "light" | "dark";

interface RolePalette {
  keyword: string;
  comment: string;
  string: string;
  number: string;
  function: string;
  type: string;
  tag: string;
  attribute: string;
  operator: string;
}

const role = (keyword: string, comment: string, string: string, number: string, fn: string, type: string, tag: string, attribute: string, operator: string): RolePalette => ({
  keyword,
  comment,
  string,
  number,
  function: fn,
  type,
  tag,
  attribute,
  operator,
});

const SYNTAX: Record<string, { light: RolePalette; dark: RolePalette }> = {
  // GitHub keeps its own map upstream; its roles are listed in the same order as the rest.
  github: {
    light: role("#cf222e", "#6e7781", "#0a3069", "#0550ae", "#8250df", "#953800", "#116329", "#0550ae", "#0550ae"),
    dark: role("#ff7b72", "#8b949e", "#a5d6ff", "#79c0ff", "#d2a8ff", "#ffa657", "#7ee787", "#79c0ff", "#79c0ff"),
  },
  catppuccin: {
    light: role("#8839ef", "#8c8fa1", "#40a02b", "#fe640b", "#1e66f5", "#df8e1d", "#8839ef", "#df8e1d", "#04a5e5"),
    dark: role("#cba6f7", "#9399b2", "#a6e3a1", "#fab387", "#89b4fa", "#f9e2af", "#cba6f7", "#f9e2af", "#89dceb"),
  },
  dracula: {
    light: role("#ff79c6", "#6272a4", "#f1fa8c", "#bd93f9", "#50fa7b", "#8be9fd", "#ff79c6", "#50fa7b", "#ff79c6"),
    dark: role("#ff79c6", "#6272a4", "#f1fa8c", "#bd93f9", "#50fa7b", "#8be9fd", "#ff79c6", "#50fa7b", "#ff79c6"),
  },
  "tokyo-night": {
    light: role("#9854f1", "#848cb5", "#587539", "#b15c00", "#2e7de9", "#007197", "#f52a65", "#8c6c3e", "#006a83"),
    dark: role("#bb9af7", "#565f89", "#9ece6a", "#ff9e64", "#7aa2f7", "#2ac3de", "#f7768e", "#e0af68", "#89ddff"),
  },
  one: {
    light: role("#a626a4", "#a0a1a7", "#50a14f", "#986801", "#4078f2", "#c18401", "#e45649", "#986801", "#0184bc"),
    dark: role("#c678dd", "#5c6370", "#98c379", "#d19a66", "#61afef", "#e5c07b", "#e06c75", "#d19a66", "#56b6c2"),
  },
  nord: {
    light: role("#5e81ac", "#6b7280", "#4f6f3a", "#8f5e91", "#2e6f8e", "#3b7f87", "#5e81ac", "#8f5e91", "#5e81ac"),
    dark: role("#81a1c1", "#616e88", "#a3be8c", "#b48ead", "#88c0d0", "#8fbcbb", "#81a1c1", "#8fbcbb", "#81a1c1"),
  },
  gruvbox: {
    light: role("#9d0006", "#928374", "#79740e", "#8f3f71", "#427b58", "#b57614", "#076678", "#b57614", "#af3a03"),
    dark: role("#fb4934", "#928374", "#b8bb26", "#d3869b", "#8ec07c", "#fabd2f", "#83a598", "#fabd2f", "#fe8019"),
  },
  solarized: {
    light: role("#859900", "#93a1a1", "#2aa198", "#d33682", "#268bd2", "#b58900", "#268bd2", "#b58900", "#859900"),
    dark: role("#859900", "#586e75", "#2aa198", "#d33682", "#268bd2", "#b58900", "#268bd2", "#b58900", "#859900"),
  },
};

/** Paseo's statusSuccess / statusDanger for its built-in light and dark themes. */
const STATUS: Record<Scheme, { success: string; danger: string }> = {
  light: { success: "#3e704a", danger: "#9d433b" },
  dark: { success: "#6cb17b", danger: "#d8847b" },
};

export interface DiffPalette {
  /** Text colors. */
  tokens: Record<TokenKind, string>;
  /** Changed words inside a paired row: strong backgrounds over the row tint, text in the plain foreground. */
  edits: Record<EditKind, string>;
  /** Full-width row bands; kinds without one keep the block's own surface. */
  rows: Partial<Record<LineKind, string>>;
  /** Laid over the theme's block background: half black in dark themes, half white in light. */
  shade: string;
}

const withAlpha = (hex: string, alpha: number) =>
  `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, ${alpha})`;

/** Paseo's default syntax theme is "one"; unknown ids fall back to it, as Paseo does. */
export function diffPalette(syntaxTheme: string, scheme: Scheme): DiffPalette {
  const syntax = (SYNTAX[syntaxTheme] ?? SYNTAX.one!)[scheme];
  const status = STATUS[scheme];
  return {
    tokens: {
      keyword: syntax.keyword,
      comment: syntax.comment,
      string: syntax.string,
      number: syntax.number,
      literal: syntax.number,
      function: syntax.function,
      type: syntax.type,
      tag: syntax.tag,
      attribute: syntax.attribute,
      property: syntax.attribute,
      operator: syntax.operator,
      addSign: status.success,
      delSign: status.danger,
      header: syntax.comment,
      hunk: syntax.function,
    },
    // Vivid, like delta's and git's word highlights: clearly brighter than the row tint, so the
    // changed words are found at a glance. Text inside them drops its syntax color for the
    // theme's foreground (set in web.ts), which stays readable on the strong background.
    edits: { addEdit: withAlpha(status.success, scheme === "light" ? 0.45 : 0.55), delEdit: withAlpha(status.danger, scheme === "light" ? 0.42 : 0.55) },
    rows: {
      // Paseo's git diff view uses 0.15 / 0.1; chat blocks sit on a tinted surface, so a step stronger.
      add: withAlpha(status.success, 0.24),
      del: withAlpha(status.danger, 0.18),
      // A faint band in the hunk color separates hunks, as GitHub's blue hunk rows do; file
      // headers get a neutral band so each file of a multi-file diff starts visibly.
      hunk: withAlpha(syntax.function, 0.1),
      header: withAlpha(syntax.comment, 0.12),
    },
    shade: scheme === "dark" ? "rgba(0, 0, 0, 0.5)" : "rgba(255, 255, 255, 0.5)",
  };
}
