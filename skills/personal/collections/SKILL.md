---
name: collections
description: Filing items Stefan reviews later in Mainframe. Use when Stefan says "remind me" or "save a reminder", asks you to propose (not make) a change to his setup or agent instructions, or asks to save a prompt as a snippet.
---

A **collection** is a folder of Markdown files, one item per file. Stefan reviews each collection on its own page in
Mainframe (`http://axalon:7070/`). You file; he decides. Mainframe writes the status fields when he clicks.

## Every item

- File name: `YYYY-MM-DD-<slug>.md`, today's date, short kebab-case slug. Never overwrite an existing file.
- Front matter, then `# Title`, then the body:

```markdown
---
created: 2026-10-22 10:40
status: open
by_model: Claude Opus 5.5
session: 01a16278-b3ed-710a-bd49-2bcb94f6c354
project: axalon
---

# Title in plain words

Body.
```

- `created`: local time, Europe/Sofia. `by_model`: your model's name. `session`: your omp session id when your context
  shows one (the `<session>` block); leave the line out otherwise. It powers Mainframe's "resume" button.
- The body is Markdown. Its first paragraph shows on the card; the rest folds under "more". Lead with the point.
- Once filed, leave `status`, `snooze_until`, `done`, `checked` and `applied` to Mainframe. Improving an item later
  means editing its body.
- Finish by telling Stefan the title and the page: `http://axalon:7070/reminders`, `/proposals` or `/snippets`.

## Reminders

Page: `/reminders`. Something Stefan wants to be nudged about later.

- Folder: Nilo work → `~/workspace/nilo-wayfinder/reminders/`, and add its one-line row to
  `~/workspace/nilo-wayfinder/ideas.md` in the same turn (that repo's rule). Everything else →
  `~/agentspace/index/wiki/reminders/`.
- `project:` `Nilo` or `axalon`; the page filters on it.
- Title starts with a verb: "Fix …", "Ask …", "Check …".
- Optional fields:
  - `due: YYYY-MM-DD` or `YYYY-MM-DD HH:MM`, only when Stefan gave a time.
  - `pr:` number plus `git_repo: owner/repo`, when it is about a PR. The page moves the reminder to "Probably done
    already" once the PR closes or merges.
- Body: what to do and why, 2–6 lines. Link the effort, ticket or PR.

## Proposals

Page: `/proposals`. A change to Stefan's setup (`AGENTS.md`, skills, configs, atlas) that he applies with one
click. Filing a proposal replaces making the change: leave the target file untouched.

- Folder: `~/agentspace/index/wiki/proposals/`.
- `target:` absolute path of the one file the change edits. A change to several files is several proposals.
- `asked:` Stefan's own words that led to it, quoted, when there were any.
- Body: why, in 2–5 lines, plus the alternatives you rejected. Then exactly one fenced `diff` block holding unified
  diff hunks against the target's current content: `@@ -a,b +c,d @@` headers, 3 lines of context, `+`/`-` lines.
  New file: one `@@ -0,0 +1,N @@` hunk.
- Apply is `patch`, so the hunk must match the file byte for byte. Check it before filing: save the hunks to a temp
  file and run `patch --dry-run --forward <target> <temp-file>`; it must exit 0.

## Snippets

Page: `/snippets`. A prompt Stefan reuses; Copy puts the body on his clipboard.

- Folder: `~/agentspace/index/wiki/snippets/`.
- Title: a short name ("Commit atomically"). Body: the prompt exactly as he would paste it, with no commentary.
