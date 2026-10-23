Makes your own sent messages nicer in the Paseo web and desktop apps: pasted tag blocks fold into
one-line fold rows, and Markdown renders. The phone apps are unchanged.

**Fold rows.** A block such as `<attachments>…</attachments>`, `<summary>`, `<context>` or
`<paste>` becomes one 28 px row: chevron, tag name, a hint, and the line count on the right, e.g.
`› attachments  workspace-row.tsx, number.ts  11 lines`. Click it (or Enter/Space) to open it in
place: the row stays where it is, its text goes a step quieter, the chevron turns and goes full
strength, and the content continues below in the same rounded shape at half the tint (raw text,
monospace, at most 320 px tall, scrolls inside, long lines wrap). Stefan picked this as style B,
opened as "B1", on `http://axalon:8080/pages/user-message-polish-mocks/`.

- What folds: the opening tag starts a line, a matching closing tag ends a later line (or the
  same line), and the content has 2+ lines. Same-name tags nested inside are part of one fold;
  the outermost block is the row. Never inside a code fence, never an inline mention (`use a <div>
  here`), never an unclosed tag.
- Settings → Plugins → user-message-polish → My messages: **Fold tag blocks**, **Render Markdown**,
  and two comma-separated lists: **Always fold** (folds even a one-line block; default
  `attachments, system-notice, system-reminder`) and **Never fold** (stays text however long;
  default `div, span, p, br, b, i, em, strong, u, s, a, img, code, pre, kbd, details, table, ul,
  ol, li`), plus "Reset to defaults". Changes apply at once in every open window.
- Hint: the tag's path attribute as a file name (`path="src/app/main.ts"` → `main.ts`), else its
  other attributes, else the file names of `<file path=…>` entries inside, else the first line.

**Markdown.** Bold, italic, strikethrough, inline code, fenced code (language kept), links and bare
URLs (open in a new tab), bullet and numbered lists (nested), quotes, headings (bold, body size),
rules. Single line breaks stay line breaks, like Paseo's plain text; a blank line becomes an 8 px
gap. Everything else stays literal text. A message with no Markdown and nothing to fold is left
exactly as Paseo draws it.

**What keeps working.** Paseo keeps its own text in the bubble, hidden; the plugin draws its copy
next to it. The copy button and rewind read the message itself, not the screen, so **Copy gives the
original text, tags included**, and rewind puts the original text back in the composer (both
checked live). Chat Find searches the drawn copy (checked: "1 of 1", highlighted once).
`omp-magic-keywords` colours keywords in it; `session-tree`'s Re-ask reads Paseo's hidden original.
`diff` fences in your messages get `chat-diff-highlight`'s colours, since the code blocks carry
Paseo's markers (checked live). Colours are mixes of the bubble's text colour, so every theme works
(checked in T3 Chat dark and Paseo Light). Turning the plugin off removes every trace at once
without a reload (checked).

Paseo 0.12 shows messages from other agents (Dispatcher etc.) as a "Message received" row, not as
your bubble, so `<paseo-system>` envelopes need nothing here (checked live).

Screenshots (`screenshots/`): `before-mixed.webp` → `after-mixed.webp` / `after-mixed-open.webp`,
`before-nested-long.webp` → `after-nested-long-open.webp` (120-line paste open, nested `<context>`,
quote, lists, diff fence), `after-stays-raw.png` (inline tags, a fence holding tags, one-line
blocks), `after-light.webp`, `web-390px.webp`, `settings.webp`.

Limits:

- Web and desktop only; the iOS and Android apps show the raw text as before.
- Text inside a closed fold row is not on screen, so Chat Find reports "No matches" for it; open
  the row first.
- Selecting text with the mouse and pressing Ctrl+C copies the drawn text (Paseo does this for your
  messages anyway); the copy button gives the original.
- It finds messages by markers Paseo puts on the page (`data-testid="user-message"`,
  `data-message-text`), not a public plugin API; tested on Paseo 0.12.0 (2026-10-23). If an update
  renames them, your messages show plain again; nothing breaks.
- The Markdown reader is the plugin's own small one (no library), so rare syntax (tables, setext
  headings, reference links, HTML) stays as text.
