# .agents

Stuff I've built for the agents I work with, and for myself while working
with them. None of it is a product.

`skills/` is grouped by topic, loosely (!). Some are for coding, some for
writing, a couple exist purely to amuse me. Symlink a folder into
`~/.omp/agent/skills/` (or a profile's) and it's live.

`.omp/extensions/` is the OMP extension pile: slash commands like `/prose`
and `/pivot` that reshape a conversation, a `/minimap` of the session,
a usage guard that puts the brakes on when a provider quota runs low, and
a few smaller ones. Symlink into `~/.omp/agent/extensions/`.
`.omp/themes/` next door works the same way, then `/theme` to pick one.
`pi/extensions/` is the same idea for plain Pi, for the rare day I run it
without OMP.

`paseo-plugins/` has one Paseo plugin per folder, mostly little UI things:
tab dots, turn status, a session tree, provider icons, filter presets. You
get the idea. Each has an `OVERVIEW.md` with screenshots.

`.herdr/plugins/` has a few Herdr plugins, enabled with
`herdr plugin link <path>`. `tools/` is for things that run on their own,
like a background session observer or a recap generator; `scripts/` is for
single-file CLIs you just execute. `tampermonkey/` has userscripts with
[install links](tampermonkey/README.md).

If a folder has an `OVERVIEW.md` or `README.md`, that's the doc. If it has
neither, the source is the doc. It's usually one file.

Icon: [svg](assets/icon.svg) · [favicon](assets/favicon.ico)
