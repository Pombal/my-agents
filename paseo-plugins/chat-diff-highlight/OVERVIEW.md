Colors diff code blocks in agent messages, terminal-diff style but quieter: added and removed lines
get a 2 px neon green/red bar at the left edge and a faint 6% tint, their text (syntax colors
included) is pulled halfway toward green or red, and every stretch of words that changed inside a
changed line is marked in reverse video: solid green/red with white text (in dark themes the solid
color is deepened so white stays readable). Each `@@` hunk header gets a tinted band and each file
header a grey band. Context lines keep the syntax colors of your Syntax theme (Settings →
Appearance). Style picked by Stefan as variant 11 of the workshop page
`http://axalon:8080/pages/diff-style-mocks.html`.

Diff blocks are also deeper than other code blocks: a 50% black layer (white in light themes) sits
over the theme's own block background, so the theme's hue stays (a purple block becomes deep
purple). Other code blocks keep the theme's color. Screenshots: `screenshots/style-11-paseo-dark.webp`,
`-t3-dark.webp`, `-paseo-light.webp` (fixtures `fixtures/chat-fixture.md` and `fixtures/prose.diff`).

Blocks fenced as `diff` or `patch` are always colored. Unlabeled blocks are colored only when they
look like a diff: git headers (`diff --git`, `---`/`+++`, `@@ -1,3`) or every line starting with
`+`, `-` or a space, with at least one of each. Blocks labeled with another language are left alone.
The code language comes from the file names in the diff headers; mock diffs without headers get a
best guess. Lines that read as prose (a prompt, docs, a message) get no syntax colors, so words like
`from` and `in` aren't painted as keywords; neither do Markdown and text files. Comments keep their
comment color.

Changed words: each removed line is paired with the most similar of the added lines after it (they
must share at least half their text), and a word-by-word diff of the pair marks every changed
stretch, on both sides, even when the edits are scattered across a long sentence. Lines rewritten
from scratch are not paired and keep the plain row color.

Paseo keeps rendering every message itself. The plugin only paints colors over the text it already
shows, so the copy button, selection, Find and copy as Markdown work as before (copying gives the raw
diff), and blocks color while the reply streams. Long diffs stay smooth: a 360-line diff is re-parsed
in about 2 ms, at most once per frame while streaming. Past 100,000 characters only rows, signs and
changed words are colored, as Paseo itself stops syntax coloring there.

Limits:

- Paseo 0.11.4 or later, in the web app and the desktop app. The iOS and Android apps show diffs as
  before.
- It relies on markers Paseo puts on chat code blocks for its own copy feature. They are not a public
  plugin API; tested on Paseo 0.12.0 (2026-10-20). If a later update drops them, the coloring stops;
  the chat itself keeps working.
- Green/red are fixed neon colors (one pair for light, one for dark themes), not the theme's own
  status colors.
- The syntax coloring is a lightweight tokenizer, close to but simpler than Paseo's own highlighter.
- No line numbers: they would have to be added as text and would end up in copies.
