Lists the past sessions of a Paseo workspace, its folder or its project and reopens them in
Paseo (built on 0.11.4; checked live on 0.12.0).

Three sources, newest activity first, starred sessions before the rest:
- **Paseo**: archived Paseo agents.
- **OMP terminal**: OMP sessions that no Paseo agent owns, e.g. old terminal or herdr sessions.
  A session any Paseo agent (live or archived, any folder) already owns is never listed twice;
  the footer counts those ("23 terminal sessions are already in Paseo and not repeated").
- **Claude Code & Codex**, on demand (Folder and Project scopes): see below.

Rows follow design 6 from `~/www/webshare/pages/past-sessions-mocks-2/`, in two densities. One
icon button next to refresh toggles them; its icon and tooltip show the density a click switches
to. The choice is saved on the host as plugin settings, so it survives reloads:
- **Comfortable** (default): provider mark; title, then a folder chip for rows outside the
  workspace folder (last path segment, full path as tooltip), then at the right
  `terminal · 2 d ago` (the word only on terminal sessions; no word = Paseo agent); below, up to
  two lines of preview.
- **Compact**: one line, the preview as a muted tail and a short time (`2d`). Hovering a row
  opens its two-line preview underneath. On phones the tail is dropped and nothing expands.

Hover or keyboard focus swaps the time for **Restore** / **Import** (the `terminal` word stays);
the whole row is the button. The time's tooltip has the absolute date. Sizes are Paseo's
defaults, 14 px titles and 12 px for the rest (plugins can't read the Interface size setting).

Preview, in order: the `paseo-recap` summary (`~/.paseo/plugin-data/paseo-recap/recaps.json`),
marked **Recap**; else the last assistant reply from the session's transcript; else nothing (the
row is just its title line). Transcripts: the OMP session file (terminal rows, and OMP agents'
native handle) or Claude Code's `~/.claude/projects/<cwd>/<id>.jsonl`. Codex keeps rollouts in
date folders that would need a search, so Codex rows have no preview (Stefan, 2026-10-20: skip it,
keep the list fast). Only the last 64 KB of a transcript is read; harness wrappers (`<paseo-system>`,
`<system-notice>` … any hyphenated tag), OMP `/prose` `[ran …; recover: …]` records, code blocks
and markdown markup are removed. Rows are dated by the transcript's newest message, not the file
mtime: OMP appends `session_exit` records to old sessions when their terminal is killed (a herdr
restart touched ~60 files on 2026-10-19), which would otherwise make them all "just now".

Provider marks: Paseo's plugin SDK does not expose its provider icons, so the built-in marks
(Claude, Codex, OMP, Pi, OpenCode, Copilot) are copied as SVG strings into
`client/provider-marks.ts` (from getpaseo/paseo at 4a5716360); plugin providers use the daemon's
provider-snapshot `iconSvg` (e.g. Antigravity); anything else gets Paseo's Bot, like the app.
The Bot carries `provider` and `serverId` props, so Stefan's `provider-icons` plugin repaints it
(`omp-nilo` → Nilo logo). Marks render as SVG images, which only the web app (and Desktop) can
draw; native phone apps show Bot.

Titles are never shortened by the plugin beyond width ellipsis; Nerd Font glyphs (Unicode private
use) are removed because app fonts render them as boxes. Paseo itself cuts the provisional title
of an agent created from a prompt to the first 60 characters of its first line
(`create-agent-title.js`), and stores it that way.

## Stars

A star keeps a session you mean to come back to at the top. It changes only the order: starred
rows come first, then the rest, each group newest first, in the main list and in the collapsed
terminal section alike. Where a session shows is unchanged.
- **Star and close this chat** (Command Center, inside a chat): stars the chat, then archives it,
  which stops the agent and closes its tab (what closing an agent tab does anyway in 0.12,
  `resolveCloseAgentTabPolicy` → `archive-on-close`). On phones the Command Center is the
  sidebar's **Search** row.
- In the list: a filled star sits before the time on starred rows. On web/desktop hovering a row
  shows an outline star; click it to star or unstar. On phones, long-press a row (a toast confirms).
- Stored in `~/.paseo/plugin-data/past-sessions/stars.json`, keyed like the list
  (`paseo:<agentId>`, `omp:<sessionId>`, `ext:<provider>:<sessionId>`). Importing a starred
  terminal or Claude Code/Codex session moves its star to the new agent; restoring keeps it.
- An open Past sessions view doesn't notice a chat closed with **Star and close** until it is
  refreshed or reopened.

## Where

- Sidebar row **Past sessions** opens a screen. The header shows project and workspace;
  **Switch** picks another workspace (sheet on phones). It starts on the most recently active
  workspace and remembers the last pick and scope until the app reloads. The URL carries
  `workspaceId` and `scope`, so links and reloads keep them.
- In a workspace, Command Center (⌘K / Ctrl+K) → **Past sessions for this workspace** opens the
  list as a tab for exactly that workspace (Explorer location allowed too).

## Toolbar

Scope buttons, search (its placeholder counts the listed sessions, "Search 141 sessions"), the
density toggle, refresh. On phones the search box gets its own line. What a scope covers ("Archived
agents of Paseo Plugins · ~/agentspace/index") is the scope button's tooltip, not a line of text.

## Scopes

- **Workspace** (default): archived agents whose Paseo workspace is this one, even when other
  workspaces share the folder (index has four). Below them, collapsed, **Terminal sessions in this
  folder (N)**: the folder's OMP sessions never opened in Paseo. Click to expand; a search opens it.
- **Folder**: everything whose cwd is the workspace folder: archived agents of any workspace
  there (including workspaces archived since) and OMP sessions, mixed by time.
- **Project**: also subfolders of the project root, every Paseo workspace of the project, every
  `git worktree` of a git project (herdr and Paseo worktrees included), and archived agents
  Paseo placed in the project.

The search box filters by every word against title and folder, in the list and the section.

Click a row to reopen it:
- Paseo → `paseo agent reload <id>` (daemon `refreshAgent`): unarchives and loads the agent, then
  the app opens it.
- OMP → `paseo import --provider <omp provider> --cwd <session cwd> <session file>` (daemon
  `importAgent`, Paseo's own import), then the app opens the new agent with its history.

The plugin SDK's `PaseoApi` (0.11.4) has no import/unarchive calls, so the daemon-side handler runs
the `paseo` CLI installed next to the daemon's Node; the CLI talks to the same daemon API.

## Claude Code & Codex sessions

In Folder and Project scopes, **+ Claude Code & Codex** at the top right of the list adds Claude
Code and Codex sessions that Paseo never opened, marked `claude code` / `codex`. The daemon lists
them (`fetchRecentProviderSessions`, the same call as Paseo's own import picker): one unscoped
listing per provider, filtered to the scope here, kept until its refresh button or a daemon restart.
Sessions a Paseo agent owns are skipped. Click imports through the session id. Not remembered:
each visit starts with the button off.

Timing (live, 2026-10-19): first listing 2.0 s (Infra - Ofis folder; the daemon starts a Codex
app-server per call); forced refresh 1.2 s; other scopes and workspaces after that 0.4–0.6 s, from
the cache. The rest of the list doesn't wait for it.

Limit: the daemon returns at most 200 sessions per provider, machine-wide, newest first. On
2026-10-19 the machine had 201 Claude Code and 119 Codex transcripts, so the oldest Claude Code
sessions already fall off.

## Which OMP sessions

Session folders come from the daemon's provider config: `omp` → `~/.omp/agent/sessions`; a
provider extending `omp` with `OMP_PROFILE=<name>` (e.g. `omp-nilo`) → `~/.omp/profiles/<name>/agent/sessions`,
imported with that provider. Folder names follow OMP 18's rule (`server/slug.ts`): under home
`-<path>` (`~/agentspace/index` → `-agentspace-index`), under `/tmp` `-tmp-<path>`, elsewhere
`--<path>--`, plus the legacy `--<abs>--` and `<home|tmp|abs>-<basename>-<sha256>` names OMP still
migrates. The name only picks candidate folders; each session's header cwd decides. Nested
subagent transcripts are skipped.

## Speed

Per file it stats, and on first sight or change reads only the first 64 KB (title record, header,
first prompt) and, for previews and dates, the last 64 KB; both are cached in the plugin's
daemon-side process by mtime and size. Measured 2026-10-19: index workspace 123 files, 22–85 ms;
nilo whole project (95 worktrees, 876 files) 134 ms cold for the scan; tail reads for its 797
listed sessions 78 ms cold, 2 ms warm; scanner alone on drimgar-compendium (522 files) 414 ms
cold, 7 ms warm.

## Proof (live web app, 2026-10-19/20, `screenshots/`)

- `desktop-dark-starred.webp`: two starred agents above an unstarred one.
- `phone-dark-star-and-close.webp`: **Star and close this chat** in the Command Center, opened
  from the phone sidebar's Search.
- `phone-dark-starred.webp`: filled stars at phone width.
- Proven live 2026-10-20 with throwaway Claude Haiku agents (deleted afterwards): Star and close
  archived the agent and closed its tab (desktop and phone width); clicking the hover star
  starred and unstarred without restoring the row; long press starred on phone width.
- `desktop-dark-folder-toolbar.webp`: toolbar with the single density toggle and no description
  line, Folder scope, Infra - Ofis › Assorted.
- `desktop-dark-folder-external-compact.webp`: Compact, Claude Code & Codex shown (3), a
  `claude code` row mixed in by time.
- `phone-dark-folder-external.webp`: phone width, index › Paseo Plugins Folder scope with 18
  Claude Code & Codex sessions, search on its own line.
- Scope tooltips and the toggle's label were read from the page's `title` attributes; the toggle
  saved `compact` and the reload kept it; set back to Comfortable afterwards.

Earlier, before the toolbar change:

- `desktop-dark-workspace-recap.webp`: Workspace scope, index › Paseo Plugins; the hovered row
  shows the Recap preview and Restore; the collapsed terminal section below.
- `desktop-dark-project-chips.webp`: Project scope, nilo › Playtest Errors: terminal rows with
  `terminal · …`, folder chips for herdr worktrees, a hovered Paseo row with Restore, a
  preview-less row (then shown as *No reply*; the placeholder is gone since), `omp-nilo` marks
  repainted by provider-icons.
- `desktop-dark-compact-hover.webp`: Compact density, a hovered row opened to its Recap, the
  terminal section expanded with `terminal · 1h` rows.
- `desktop-light-workspace.webp`: light theme, nilo-wayfinder › Subagents: OMP, Claude (with
  previews from Claude Code transcripts) and Codex rows (*No reply* then, no preview now), a
  hovered Restore.
- `phone-light-project-comfortable.webp`, `phone-light-project-compact.webp`,
  `phone-dark-workspace-comfortable.webp`: phone width; search on its own line; the terminal
  section expanded.
- Density choice survived a page reload (checked; settings file
  `~/.paseo/plugin-settings/past-sessions/`), and was set back to Comfortable afterwards.
- From earlier versions (same reopen code): `restored-claude-agent.webp` (a throwaway Claude
  Haiku agent restored by a click), `reopened-paseo-agent.webp`, `reopened-omp-session.webp`
  (an OMP-only session imported in 3.1 s). Earlier counts matched an independent brute-force
  scan (index 114 = 14 + 100, 20 hidden; Infra - Ofis 31 = 5 + 26, 17 hidden; nilo project 656
  OMP only, 9 hidden).

## Limits

- Verified in the web app (desktop size and phone-sized web, light and dark). The UI uses only
  React Native and host components, so it should run in Desktop and the iOS/Android apps; native
  apps were not opened.
- Workspace scope can't show agents whose workspace was archived (41 of 74 archived agents
  daemon-wide on 2026-10-19); Folder and Project scopes find them by cwd.
- Importing from the section lets the daemon pick the workspace for that folder, which may be a
  sibling workspace in the same folder rather than the one being viewed.
- Reopening needs the `paseo` CLI on the daemon host (next to the daemon's Node, else on `PATH`).
- Titles come from the first 64 KB: a session whose first prompt starts later shows "Empty session".
  Short automated sessions (e.g. "Reply with just: ok" probes) are listed like any other.
- Switch lists active Paseo workspaces only. Live agents are not listed (they are in the sidebar).
- Session folders set via `PI_CODING_AGENT_SESSION_DIR`, `sessionDir` settings or `XDG_DATA_HOME`
  are not read. Claude Code and Codex sessions: see the 200 limit above.
- A preview needs an assistant reply in the transcript's last 64 KB; a session that ends in a
  long tool run shows an older reply or no preview. Tooltips (full path, absolute time) and hover
  exist only on web/desktop.

## Disable

Settings → Plugins → past-sessions, or `paseo plugin disable past-sessions`
(`paseo plugin remove past-sessions` unregisters it; the directory stays). Then refresh the app.
