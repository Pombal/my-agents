Shows OMP's magic keywords in moving rainbow colors, the way OMP's terminal shows them: `ultrathink`,
`orchestrate`, `workflowz` and `jevify`. The colors appear while you type and stay on the word in the
sent message (and in the chat outline's hover preview). Each word has OMP's own color range
(ultrathink the full rainbow, orchestrate green to purple, workflowz orange to green, jevify magenta to
yellow), running across the word on OMP's 1.8-second cycle, with a smoother sweep and more even colors
than OMP uses. Screenshots: `screenshots/composer-dark.webp`, `screenshots/sent-dark-a.webp`,
`screenshots/settings-dark.webp`.

A word is colored only where the chat's agent would act on it. By default a chat's words follow its
agent's provider id:

- OMP (`omp` and the `omp-…` profile providers): all four, by OMP's rule: exact lowercase, standing
  alone as prose. `Ultrathink`, `orchestrated`, `orchestrate.ts`, `foo::orchestrate`, `orchestrate()`
  and words inside code spans, fenced code blocks or HTML/XML tags stay plain.
- Claude Code (`claude`): `ultrathink` only, by Claude Code's own rule (`/\bultrathink\b/i` on the
  raw prompt, as in 2.1.301): any case, also inside code spans and tags, not `ultrathinking`.
- Any other provider: none.
- An agent the plugin cannot identify: all four, by OMP's rule.

"Every chat" in the settings gives every chat all four. The matching rules and the hue ranges come
from OMP 18.12.2; `client/keywords.ts` lists where each part comes from. A keyword switched off in
OMP itself (`omp config set magicKeywords.<id> false`) is still colored here; edit the table in
`client/keywords.ts` if that ever matters.

Settings (Settings → Plugins → omp-magic-keywords, or ⌘K / Ctrl+K "OMP magic keywords settings"):
moving, still or off, separately for sent messages and for the text box; which chats (only where the
words act, or every chat); a preview of the four words. The dropdowns are saved on the host, so every
window of this daemon follows them.

Paseo keeps rendering everything itself. In sent messages the plugin only paints colors over the text
Paseo already shows, so copy, selection, Find, rewind and the timestamp row work as before. Over the
text box it lays a see-through copy of your text, aligned to the pixel, with only the keywords
colored; the box keeps its own text, cursor and spell check. The copy hides when its line count
differs from the text box's; a line that breaks at a different place with the same line count cannot
be detected. Only what is on screen animates; with the system's reduced-motion setting on, the colors
stay still. Every letter has the same perceptual lightness, OKLCH L 0.80 in dark themes and 0.50 in
light ones, at chroma 0.17 (less where the screen's sRGB colors cannot reach it) along OMP's hue sweep,
tuned so that no part of a word loses contrast against Paseo's message bubble.

Limits:

- Web and desktop apps only; the iOS and Android apps show the words plain.
- It finds messages, the text box and the outline preview by markers in Paseo's page
  (`data-testid="user-message"`, `data-message-text`, `data-composer-input`,
  `chat-outline-preview`) and reads the agent id from React's component props. None of these is a
  public plugin API: if a Paseo update renames a marker, that part shows the words plain; if the agent
  lookup breaks, every chat counts as unidentified and the browser console shows one
  `[omp-magic-keywords]` warning.
- A provider is recognised by its id only (`omp`, `omp-…`, `claude`); one that runs OMP or Claude
  Code under another name counts as "other" and shows the words plain.
- New keywords in a later OMP release stay plain until the plugin's keyword table is updated.
- Not tested: the Electron desktop app, typing with an IME, attachment chips next to the text box, the
  fullscreen composer, page zoom, and web fonts that finish loading after the page is shown.

Cost, measured in the web app on this machine (Paseo 0.12.0, headless Chromium, 2026-10-20): a
keystroke in the text box adds 0.1–0.2 ms of plugin work with no keyword present (the matcher only;
5 µs for a typical prompt, 0.2 ms for 20 KB) and 0.6–2.7 ms with one (overlay copy and ranges);
a sent message with 20 colored letters costs 0.8 ms to set up. The moving colors cost about 30–40 ms
of main-thread time per second per message on screen (paint, not script), 0.2 ms when still. Window
focus re-reads the settings (one cached RPC, 1–3 ms) and rescans only if a setting changed. The
plugin's server part only registers the settings; it never spawns a process.
