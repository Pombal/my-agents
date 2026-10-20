Shows OMP's magic keywords in your sent messages in moving rainbow colors, the way OMP's terminal
shows them while you type: `ultrathink`, `orchestrate`, `workflowz` and `jevify`. Each word gets
OMP's own color range (ultrathink the full rainbow, orchestrate green to purple, workflowz orange to
green, jevify magenta to orange), and the colors run across the word in OMP's 1.8-second cycle.
Screenshots: `screenshots/sent-dark-a.webp`, `screenshots/sent-light.webp`.

A word is colored only where OMP would act on it: exact lowercase, standing alone as prose.
`Ultrathink`, `orchestrated`, `orchestrate.ts`, `foo::orchestrate`, `orchestrate()` and words
inside code spans, fenced code blocks or HTML/XML tags stay plain. The matching rules and colors are
copied from OMP 18.12.2; the source file lists where each part comes from.

Paseo keeps rendering every message itself. The plugin only paints colors over the text it already
shows, so copy, selection, Find, rewind and the timestamp row work as before. Only messages on
screen animate; the animation stops when none are visible. With the system's reduced-motion setting
on, the words keep a still gradient. In light themes the colors are darker than OMP's so they stay
readable on a light bubble.

Limits:

- Web and desktop apps only; the iOS and Android apps show the words plain.
- The text box you type in is not colored. Paseo gives plugins no way to style it.
- Every chat is colored, whatever the provider. Only OMP agents act on these words (Claude Code also
  knows `ultrathink`).
- It finds sent messages by markers in Paseo's page (`data-testid="user-message"`,
  `data-message-text`). They are not a public plugin API; tested on Paseo 0.12.0 (2026-10-20). If an
  update drops them, the coloring stops and the chat keeps working.
- New keywords in a later OMP release stay plain until the plugin's keyword table is updated.
