Lists the past sessions of a Paseo workspace, its folder or its project and reopens them in
Paseo (Paseo 0.11.4).

Two sources, newest activity first:
- **Paseo**: archived Paseo agents.
- **OMP terminal**: OMP sessions that no Paseo agent owns, e.g. old terminal or herdr sessions.
  A session any Paseo agent (live or archived, any folder) already owns is never listed twice;
  the footer counts those ("23 terminal sessions are already in Paseo and not repeated").

Each row: title (Paseo agent name or OMP session title, else the first prompt line), relative
time on the right, a source tag, local date and time (`2026-10-17 19:14`), and outside the
listed folder the subfolder or `~/…` path. The right edge says what a click does: **Restore**
(Paseo) or **Import** (OMP); phone-sized layouts show only the icon.

## Where

- Sidebar row **Past sessions** opens a screen. The header shows project and workspace;
  **Switch** picks another workspace (sheet on phones). It starts on the most recently active
  workspace and remembers the last pick and scope until the app reloads. The URL carries
  `workspaceId` and `scope`, so links and reloads keep them.
- In a workspace, Command Center (⌘K / Ctrl+K) → **Past sessions for this workspace** opens the
  list as a tab for exactly that workspace (Explorer location allowed too).

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
first prompt); results are cached in the plugin's daemon-side process by mtime and size. The
footer shows files scanned and handler time (all daemon API calls included). Measured 2026-10-19:
index workspace 123 files, 22–85 ms; nilo whole project (95 worktrees, 876 files) 134 ms cold;
scanner alone on drimgar-compendium (522 files) 414 ms cold, 7 ms warm.

## Proof (live web app, 2026-10-19, `screenshots/`)

- `workspace-paseo-plugins.webp`: index › Paseo Plugins, 13 archived agents of that workspace only.
- `same-folder-collapsed.webp` → `same-folder-expanded.webp`: the 100 terminal sessions of
  `~/agentspace/index`, collapsed under the list, then expanded with Import rows.
- `workspace-mainframe.webp`: index › Mainframe has no archived agents (its 2 agents are live),
  so the empty state shows above the same 100-session section.
- `search-workspace-diff.webp`: search "diff" on Mainframe: no agent matches, the section opens
  with the one matching terminal session.
- `folder-scope-index.webp`, `project-scope-index.webp`: Folder and Project scopes for index.
- `compact-workspace.webp`, `compact-same-folder-expanded.webp`, `compact-switch-workspace.webp`:
  phone-sized web layout (dark system theme), section expanded, Switch sheet.
- `reopened-paseo-agent.webp`, `reopened-omp-session.webp` (first version, same reopen code):
  an archived agent restored and an OMP-only session imported (3.1 s) in a throwaway folder; both
  then left the list. The proof agents, workspaces, project and files were deleted afterwards.
  Earlier counts matched an independent brute-force scan (index 114 = 14 + 100, 20 hidden;
  Infra - Ofis 31 = 5 + 26, 17 hidden; nilo project 656 OMP only, 9 hidden).

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
  are not read. Non-OMP provider sessions (Claude Code, Codex) only appear once Paseo owns them.

## Disable

Settings → Plugins → past-sessions, or `paseo plugin disable past-sessions`
(`paseo plugin remove past-sessions` unregisters it; the directory stays). Then refresh the app.
