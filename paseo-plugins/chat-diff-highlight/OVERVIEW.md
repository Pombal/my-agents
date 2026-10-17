Colors diff code blocks in agent messages: green and red rows for added and removed lines, as in
Paseo's git diff view, and syntax colors for the code inside them, using your Syntax theme from
Settings → Appearance in both light and dark themes.

Blocks fenced as `diff` or `patch` are always colored. Unlabeled blocks are colored only when they
look like a diff: git headers (`diff --git`, `---`/`+++`, `@@ -1,3`) or every line starting with
`+`, `-` or a space, with at least one of each change. Blocks labeled with another language are left
alone. The code language comes from the file names in the diff headers; mock diffs without headers
get a best guess.

Paseo keeps rendering every message itself. The plugin only paints colors over the text it already
shows, so the copy button, selection, Find and copy as Markdown work as before, and blocks color
while the reply streams.

Limits:

- Paseo 0.11.4 or later, in the web app and the desktop app. The iOS and Android apps show diffs as
  before.
- It relies on markers Paseo puts on chat code blocks for its own copy feature. They are not a public
  plugin API, so a future Paseo update could stop the coloring until the plugin is adjusted. The chat
  itself keeps working either way.
- The syntax coloring is a lightweight tokenizer, close to but simpler than Paseo's own highlighter.
