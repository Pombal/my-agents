A `cmds` composer pill (label only, no icon) in every chat, any provider. It lists your reusable prompt files from `.agents/commands/*.md` and puts one into the chat with a click. Design: `~/www/webshare/pages/agent-commands-mocks/simple.html?on=desc,filter,send&rows=inline&tone=extra&agent=busy`.

## What it does

- **List.** Click `cmds`: a popover (desktop) or bottom sheet (phones) with the chat's commands, sorted by name. Each row is the name, then the description on the same line in Paseo's extra-muted grey, wrapping, at most two lines. Commands with `on-click: send` get a small ↑.
- **Click inserts.** The file's text (frontmatter removed, as-is, `$ARGUMENTS` left alone) goes into the real message box at the cursor, keeping any draft around it. The popover closes and the message box gets focus with the cursor after the inserted text. Send as usual. Web and desktop app only (see Limits).
- **`on-click: send`** sends the text at once (placeholders become empty). While the agent is busy it never cancels the reply: OMP agents (and providers built on OMP, e.g. `omp-nilo`) get `/follow-up <text>`, queued after the running turn; other providers get the text steered into the running turn (Paseo falls back to interrupting where a provider cannot steer).
- **Type to filter** (desktop). No search bar until you type; then a slim filter line appears, matches are underlined, ↑ ↓ move, ↵ picks, Esc clears the filter (a second Esc closes). Name and description both match.
- **Phones** (compact layout, and native apps on any size): the sheet has a search field. Tapping a command opens a small send view: description, an optional Arguments field, a preview of the text to send, and Send ("Send as follow-up" while an OMP agent is busy). Arguments fill the placeholders the same way as the `/` menu below.
- **Shadowing.** The first file of a name wins and the others are hidden, silently: a project `commit.md` hides your `~/.agents/commands/commit.md`.
- **Empty state.** "No commands yet. Put .md files in .agents/commands/ in this project or in ~/.agents/commands/."

The plugin always sends the expanded text, never `/name`: a slash command sent while busy cancels the reply in OMP and Claude Code, and Claude Code and Codex don't read `.agents/commands`.

## Where commands come from

Read by the daemon (where the agent runs) each time the list opens; parsed files are cached by mtime. Top-level `*.md` only, no subfolders. Order, first name wins:

1. `.agents/commands/` from the agent's cwd up to its git root, nearest first (a worktree's `.git` file counts; no git root: the cwd only; `~` is never a project folder).
2. `~/.agents/commands/`.
3. Extra folders that are switched on, in the project (same walk) and then in `~`, in this order: `.claude/commands` + `~/.claude/commands`, `.cursor/commands` + `~/.cursor/commands`, `.omp/commands` + `~/.omp/agent/commands`, `~/.codex/prompts`. Rows from these show a small tag (`claude`, `cursor`, `omp`, `codex`).

## Frontmatter

Flat `key: value` lines between `---` fences; other keys are ignored.

| Key | Meaning |
|---|---|
| `description` | Shown after the name. Missing: the first non-empty body line without `#`s, cut to 80 characters. |
| `argument-hint` (or `argumentHint`) | Shown in the `/` menu and as the phone Arguments placeholder. Not shown in the list. |
| `on-click` | `insert` (default) or `send`: what clicking the row does. |

Placeholders (used by the `/` menu and the phone send view, OMP's dialect): `$ARGUMENTS` and `$@` = all arguments, `$1`, `$2`… = one each (1-based, shell-style quotes group words), `$@[2]` / `$@[2:3]` = a slice. A body without placeholders gets the arguments appended after a blank line.

## Settings

Settings → Plugins → agent-commands (host settings, all off by default):

- **Extra folders**: one switch each for `.claude/commands`, `.cursor/commands`, `.omp/commands`, Codex prompts (`~/.codex/prompts`).
- **Project / User groups**: small muted "Project" and "User" headings in the list.
- **Commands in the / menu**: each command also becomes a plugin slash command. Pick `/name`, type arguments, Enter: the plugin expands this chat's file and sends the text (busy rules as above). Slash commands are global per plugin, so the menu lists the union of names over all open chats' folders; a name the current chat doesn't have goes to the agent unchanged. Names Paseo rejects (anything but `a-z`, `0-9`, `-`) stay out of the menu. Paseo's built-ins and earlier plugins win name clashes (e.g. `btw`).

## Limits

- **Insert is a web/desktop DOM trick, not an API.** Paseo 0.12.0 has no plugin call that writes into the message box. The plugin finds the chat's `<textarea data-composer-input>` next to its own pill, sets the value with the native setter and fires `input`, so React's draft state follows. A composer refactor in Paseo can break it; it then shows "Couldn't find this chat's message box."
- **Phones and native apps can't insert**: they get the send view instead (own text field, no attachments, `@file` or voice).
- Esc with a filter typed: Paseo closes its popovers on Esc before a plugin sees the key, so the plugin reopens the list unfiltered when that Esc is released (a brief flicker).
- One pill per chat, registered from the agent list: a new chat gets its pill after its first message. The pill's place in the pill row is Paseo's choice.
- Settings changed on another client reach this client's `/` menu after a reload or the next settings save here.
- Native apps load plugin updates only after a refresh or reopen.

## Development

`npm install`, `npm test` (vitest: frontmatter parsing, OMP argument expansion, folder order and shadowing), `npm run typecheck`. `paseo plugin reload agent-commands` applies edits.

## Live proof (2026-10-23, web app on daemon 0.12.0, OMP + Claude Haiku 5.5)

Throwaway project `~/tmp-archive/agent-commands-test` (git repo) with project `custom-command-commit.md` (shadows the real `~/.agents/commands/custom-command-commit.md`), `review.md` (`on-click: send`), `echo-args.md` and two others, plus `.claude/commands/{pr-summary,review}.md`. Removed afterwards along with the agent and workspace. Claude Code agents could not be used: the Claude CLI login had expired, so the steer path for non-OMP providers was not run live.

- First, before building: a value set through the native setter plus an `input` event in the real composer, then Enter, sent exactly that text (agent replied `INSERTED-VIA-DOM`).
- `desktop-list.png`: the list; the project `custom-command-commit` ("PROJECT commit — shadows the user one") is listed and the user one is not; ↑ on `review`.
- `desktop-filter.png`: typed `rel`, filter line, underlined matches. Esc cleared the filter and kept the list open; a second Esc closed it. ↓ ↵ inserted `release-notes`.
- `desktop-after-insert.png`: draft "Ignore this prefix. " + click on `custom-command-commit` → text inserted after the draft, message box focused, cursor at the end (selection 118/118). Enter sent it; the agent replied `PROJECT-COMMIT-RECEIVED`.
- `desktop-list-busy.png`: during a `sleep 30` tool call, clicking `review` sent `/follow-up <text>`; the running turn finished `DONE-SLEEPING`, then the queued one replied `REVIEW-SENT` (not cancelled).
- `settings.png`, `desktop-list-groups-extra.png`: with `.claude/commands`, groups and the `/` menu on, `pr-summary` shows with a `claude` tag, `.claude/commands/review.md` stays hidden behind `.agents`, headings Project/User. `/echo-args alpha "beta gamma"` + Enter sent the expanded text (`first=[alpha] second=[beta gamma] all=[alpha beta gamma]`); with the menu off again, `/echo-args x y` went to OMP unchanged.
- `phone-sheet-list.png`, `phone-sheet-send.png`: 390 px layout, bottom sheet with search; tapping `echo-args`, typing `one two` and Send delivered the expanded text.
