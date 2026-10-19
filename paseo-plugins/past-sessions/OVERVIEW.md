Lists past sessions for a Paseo workspace's folder and reopens them in Paseo (Paseo 0.11.4).

Two sources, newest activity first:
- **Paseo**: archived Paseo agents whose cwd is the folder (or whose workspace is this one).
- **OMP terminal**: OMP sessions recorded for the folder that no Paseo agent owns, e.g. old
  terminal or herdr sessions. A session any Paseo agent (live or archived, any folder) already
  owns is not listed again; the summary line counts them as "already open in Paseo hidden".

Each row shows the title (OMP session title or Paseo agent name, else the first prompt line),
the time as relative and local absolute (`2 d ago · 2026-10-17 19:14`), a source badge, and in
project scope the subfolder or worktree path.

## Where

- Sidebar row **Past sessions** (top section) opens a screen. Pick the workspace with
  **Change**; it starts on the most recently active workspace and then remembers the last pick
  until the app reloads. The URL carries `workspaceId` and `scope`, so links and reloads keep them.
- In a workspace, Command Center (⌘K / Ctrl+K) → **Past sessions for this workspace** opens a
  workspace tab for exactly that workspace. The panel also allows the Explorer location.
- **This folder** (default): sessions whose cwd is the workspace folder itself.
  **Whole project**: also subfolders of the project root, every Paseo workspace of the project,
  every `git worktree` of a git project (herdr and Paseo worktrees included), and archived agents
  Paseo placed in the project.

Click a row to reopen it:
- Paseo row → `paseo agent reload <id>` (daemon `refreshAgent`): unarchives and loads the agent,
  then the app opens it.
- OMP row → `paseo import --provider <omp provider> --cwd <session cwd> <session file>` (daemon
  `importAgent`, what Paseo's own import does), then the app opens the new agent with its history.

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
first prompt); results are cached in the daemon-side plugin process by mtime and size. Measured
2026-10-19 (handler time incl. all daemon API calls, shown at the end of the summary line):
`~/agentspace/index` folder, 120 OMP files + 110 agents: 70 ms cold; nilo whole project
(95 worktrees, 876 files): 134 ms cold. Scanner alone: drimgar-compendium 522 files 414 ms cold,
7 ms warm.

## Proof (live web app, 2026-10-19, `screenshots/`)

- `index-folder.webp`, `index-project.webp`: index shows 114 = 14 Paseo + 100 OMP only, 20 hidden.
  An independent brute-force scan of every session folder gave the same numbers (also for
  Infra - Ofis 31 = 5 + 26, 17 hidden, and nilo whole project 656 OMP only, 9 hidden).
- `nilo-wa-ftue-folder.webp` → `nilo-project.webp`: the toggle on a Paseo worktree: 0 in the folder,
  658 across the project.
- Throwaway proof folder: `proof-folder-before.webp` (2 archived agents, 2 OMP-only, 1 hidden) →
  `reopened-paseo-agent.webp` (archived Claude agent unarchived and opened) →
  `reopened-omp-session.webp` (OMP-only session imported in 3.1 s, history shown) →
  `proof-folder-after-both-reopens.webp` (both gone from the list, hidden count 2).
  From the panel (`workspace-panel.webp`) an archived OMP-backed agent was reopened too.
  The proof agents, workspaces, project and session files were deleted afterwards.
- `compact-web-layout.webp`, `compact-web-picker.webp`: phone-sized web layout, picker as a sheet.

## Limits

- Verified in the web app (desktop size and phone-sized web). The UI uses only React Native and
  host components, so it should run in Desktop and the iOS/Android apps; native apps were not
  opened.
- Reopening needs the `paseo` CLI on the daemon host (next to the daemon's Node, else on `PATH`).
- Titles come from the first 64 KB: a session whose first prompt starts later shows "Empty session".
  Short automated sessions (e.g. "Reply with just: ok" model probes) are listed like any other.
- The screen's picker lists active Paseo workspaces only; a project without one (e.g. my-agents
  today) needs a workspace first. Live Paseo agents are not listed (they are in the sidebar).
- Session folders set via `PI_CODING_AGENT_SESSION_DIR`, `sessionDir` settings or `XDG_DATA_HOME`
  are not read. Non-OMP provider sessions (Claude Code, Codex) only appear once Paseo owns them.
- Reopening an archived agent whose workspace is archived was not tested.

## Disable

Settings → Plugins → past-sessions, or `paseo plugin disable past-sessions`
(`paseo plugin remove past-sessions` unregisters it; the directory stays). Then refresh the app.
