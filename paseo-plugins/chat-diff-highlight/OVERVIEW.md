Colors diff code blocks in agent messages the way GitHub and Paseo's git diff view do: green and red
rows for added and removed lines, a darker mark on the words that changed inside a changed line, a
tinted band on each `@@` hunk header and a grey band on file headers, so every file and hunk starts
visibly. The code inside gets syntax colors from your Syntax theme (Settings → Appearance), in light
and dark themes.

Blocks fenced as `diff` or `patch` are always colored. Unlabeled blocks are colored only when they
look like a diff: git headers (`diff --git`, `---`/`+++`, `@@ -1,3`) or every line starting with
`+`, `-` or a space, with at least one of each. Blocks labeled with another language are left alone.
The code language comes from the file names in the diff headers; mock diffs without headers get a
best guess.

Changed words are marked only where a removed line clearly became an added one (they share most of
their text), as on GitHub. Rewritten lines keep the plain row color.

Paseo keeps rendering every message itself. The plugin only paints colors over the text it already
shows, so the copy button, selection, Find and copy as Markdown work as before (copying gives the raw
diff), and blocks color while the reply streams. Long diffs stay smooth: a 360-line diff is re-colored
in about 4 ms, at most once per frame while streaming. Past 100,000 characters only rows and signs
are colored, as Paseo itself stops syntax coloring there.

Limits:

- Paseo 0.11.4 or later, in the web app and the desktop app. The iOS and Android apps show diffs as
  before.
- It relies on markers Paseo puts on chat code blocks for its own copy feature. They are not a public
  plugin API, but Paseo 0.12.0 still renders code blocks with the same markers, so it should keep
  working after the upgrade. If a later update drops them, the coloring stops; the chat itself keeps
  working.
- Row and word colors use Paseo's built-in light and dark green/red; a custom theme with different
  status colors still gets those.
- The syntax coloring is a lightweight tokenizer, close to but simpler than Paseo's own highlighter.
- No line numbers: they would have to be added as text and would end up in copies.
