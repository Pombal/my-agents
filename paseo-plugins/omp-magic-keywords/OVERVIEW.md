Shows OMP's magic keywords in moving rainbow colors, the way OMP's terminal shows them: `ultrathink`,
`orchestrate`, `workflowz` and `jevify`. The colors appear while you type and stay on the word in the
sent message (and in the chat outline's hover preview). Each word has OMP's own color range
(ultrathink the full rainbow, orchestrate green to purple, workflowz orange to green, jevify magenta to
orange), running across the word on OMP's 1.8-second cycle, with a smoother sweep and brighter colors
than the terminal can show. Screenshots: `screenshots/composer-dark.webp`, `screenshots/sent-dark-a.webp`,
`screenshots/sent-light.webp`, `screenshots/settings-dark.webp`.

A word is colored only where OMP would act on it: exact lowercase, standing alone as prose.
`Ultrathink`, `orchestrated`, `orchestrate.ts`, `foo::orchestrate`, `orchestrate()` and words inside
code spans, fenced code blocks or HTML/XML tags stay plain. By default only chats whose agent acts on
the words are colored: OMP agents get all four, Claude Code gets `ultrathink` (the one it honors),
other providers none; a chat whose agent cannot be identified gets all four. Words you have switched
off in OMP itself (`omp config set magicKeywords.<id> false`, per profile) stay plain too. The matching
rules and colors come from OMP 18.12.2; `client/keywords.ts` lists where each part comes from.

Settings (Settings → Plugins → omp-magic-keywords, or ⌘K "OMP magic keywords settings"): moving,
still or off, separately for sent messages and for the text box; which chats (only where the words
act, or every chat); a preview of the four words. The dropdowns are saved on the host, so every
window of this daemon follows them.

Paseo keeps rendering everything itself. In sent messages the plugin only paints colors over the text
Paseo already shows, so copy, selection, Find, rewind and the timestamp row work as before. Over the
text box it lays a see-through copy of your text, aligned to the pixel, with only the keywords
colored; the box keeps its own text, cursor and spell check, and the copy disappears the moment
the text no longer lines up, so colors never land on the wrong word. Only what is on screen
animates; with the system's reduced-motion setting on, the colors stay still. In light themes the
colors are darker so they stay readable on a light bubble.

Limits:

- Web and desktop apps only; the iOS and Android apps show the words plain.
- It finds messages, the text box and the outline preview by markers in Paseo's page
  (`data-testid="user-message"`, `data-message-text`, `data-composer-input`,
  `chat-outline-preview`) and reads the agent id from React's component props. None of these is a
- OMP's own on/off flags are read when the app starts and whenever the window regains focus (cached
  for 60 s), by running `omp config list --json` for each OMP provider in Paseo's config.
- OMP's own on/off flags are read once per hour-ish (60 s cache, re-read when the window regains
  focus) by running `omp config list --json` for each OMP provider in Paseo's config.
- New keywords in a later OMP release stay plain until the plugin's keyword table is updated.
- Not tested: the Electron desktop app, typing with an IME, attachment chips next to the text box.
