Wayfinder efforts (`.scratch/<effort>/map.md` + `issues/NN-*.md`) inside Paseo, read-only. Built on
Paseo 0.12.0 from the final mockups `http://axalon:8080/pages/efforts-dashboard-mocks-4/` plus the
approved additions in `/home/cx/agentspace/index/.scratch/paseo-grievances/efforts-dashboard-overcorrection-check.md`.

## Status (2026-10-20)
All four steps built and checked live in the web app, dark and light (desktop 1440 px, explorer
320/240 px, phone 390 px). Also proven live: the global search and the unbound search (Efforts /
Tickets / Docs groups; each kind opens in the right column, or binds and opens in the panel), Bind
and Unbind (popover and `⋯`), and "Grill in new chat" (new chat in the bound workspace's folder, on
that workspace's latest model, prompt `Grill ticket <abs path> with the grilling skill. Read the
effort's map first: <abs map.md>`, title `<slug> <NN> <title>`, label `effort=<slug>`).
Throwaway fixture: workspace "Grill Test" at `~/tmp-archive/efforts-grill-test` (a `~/tmp-archive`
folder, so it only shows up while listed under extra folders).

## Where Stefan sees it
- Explorer panel → `+` → **Efforts** (⌘K "Efforts for this workspace").
- **Header pill** per workspace: map icon + effort name + chevron; `bind?` when unbound with a
  suggestion; nothing when there is none. Popover (option B): name + status, path, counts,
  `Not committed · N`, the next ticket (opens it in the panel), Open Efforts panel, "Switch this
  workspace to" (efforts it leans on, then Other effort…), All efforts, Unbind. Unbound: the
  suggestion with Bind · New effort · No effort. On phones the header button is icon-only and
  opens the whole effort as a sheet.
- **Sidebar row "Efforts"** → global screen (⌘K "All efforts"): search over efforts, tickets, docs
  and workspace names (results grouped, replacing the table while typing; `/` focuses), project
  chips, columns Done / Effort / Open tickets / Workspaces / Next / Touched. Per `.scratch`
  group: efforts with a bound or suggested workspace, then **Touched this week, no workspace**,
  then the older ones folded (newest first), then workspaces with no effort and no suggestion.
  Opened from a workspace (pill or ⋯ → All efforts): that project only ("show all" undoes it) and
  the effort marked "you came from …". Clicking a row reads the effort in a right column (the
  same component as the panel, keyed by effort path, so efforts without a workspace are
  readable); chips open that workspace with its Efforts panel. Phones: two-line rows (name /
  `Next 01 …`, done count + bar), the effort opens full screen.
- **Phone composer pill** `wa-ftue · 0/9 done` on every chat of a bound workspace, compact
  layouts only (< 720 px); tap → sheet with all rows; a row opens in place with its Question,
  status line, the chat button and Read.
- Settings → Plugins → efforts-dashboard's menu → **Efforts** (route
  `/settings/hosts/<server>/plugins/efforts-dashboard/folders`): extra folders. Not in the
  settings sidebar.

## Efforts tab
- **Bound workspace (E):** name + map `Status:` pill, Destination (one line; click opens map.md at
  Destination), counts in words with every non-zero bucket (`0/9 done · 8 ready · 1 blocked`), a
  `Deadline:` line only when the map has one.
- Tickets: claimed first, then ready with **next** on top (brighter row, `next · blocks 04`, and
  its Question as one muted line under it), `Blocked · N` (+ `after 01`), `Parked · N`, `▸ Done · N`
  fold. Type shown when not grilling; age only when ≥ 7 days. Parser anomalies (duplicate numbers,
  unknown Status word, Blocked-by naming another effort's ticket) as muted lines.
- Folds: **Not committed** (open when non-empty; per file/folder with time, changed map sections
  and `+16 −3` / `2 new`; copy-paths icon), Decisions (title · date, newest first, amber dot on
  uncommitted ones), Not yet specified / Out of scope (map bullets, links open in the viewer),
  Leans on, Commits. Doc chips: map.md with its age, top-level docs, folders with counts,
  `.artifacts/<slug>/` when it exists.
- Drill-in (D): `1 of 9` with prev/next, relations (`blocks`, `after`), path, raw Status line only
  when it says more than the word, the ticket body, **Grill / Prototype / Research / Work in new
  chat** (creates an agent in this workspace with that workspace's latest chat settings and opens
  it; label `effort=<slug>`) and Copy path. map.md opens as an outline (sections with item counts,
  `N lines not committed`). Folder chips list files; relative links open in the same viewer.
- `⋯`: Switch effort…, Open map.md, Copy path, All efforts, Unbind, and the legend.
- **Unbound (U):** suggestion card with its reason in words and Bind · New effort · No effort; a
  search over efforts, tickets and docs of this project (server-side, grouped Efforts / Tickets /
  Docs; picking a ticket or doc binds and opens it; `/` focuses on web); "Recent in <project> · 6";
  "All efforts in <project>". New effort starts a chat that charts the map and binds at once.
- Below 260 px the bar, the status pill and `· blocks 04` give way.

## Data rules
- Roots: the `.scratch` of every Paseo workspace (realpath, deduped, so nilo's worktrees count as
  nilo-wayfinder) plus the extra folders setting. `__share__` and `~/tmp-archive` are
  skipped unless listed; a workspace whose `.scratch` is skipped says so in its Efforts tab, with
  the reason and where to list it. `_to_organize_`, hidden folders and folders with no
  map/issues/Markdown are not efforts. No map: title = first `# ` of the biggest top-level `.md`.
- Ticket status = first word of `Status:` (bold, dates and prose allowed) → open / claimed /
  done / parked; unknown words count as open. Blocked = open and a `Blocked by:` ticket here is
  not done; `chat-widgets 08` style references resolve to the other effort; prose blocks nothing.
  next = lowest-numbered open, unblocked, unclaimed ticket. Ticket titles drop a repeated number
  (`# 04 — Slice-1 spec`, or `# 01 Pick a colour` when it is the file's own number).
- Leans on = sibling efforts linked as `../<slug>/` from map.md outside Out of scope; the reason is
  the linking bullet's bold lead or first clause.
- Not committed = `git status` of the repo owning the effort's real path (so the symlinked worktree
  `.scratch` shows nilo-wayfinder's changes).
- Binding: workspace id → effort in `~/.paseo/plugin-data/efforts-dashboard/bindings.json`
  (or "no effort"); Unbind deletes the workspace's entry. Never set silently. Suggestions, in
  order: the folder's `.omp/RULES.md`, `.scratch/<slug>/` mentions in the last 256 KB of the
  workspace's chats of the last 3 days (3+ and twice the runner-up), workspace name, newest files
  (only when no other workspace shares the `.scratch`).
- Files are cached by mtime; the client re-reads every 5 s only while the surface is on screen.
  Overview ~170 ms cold, ~30 ms warm on the real roots.
- Colours come only from Paseo's theme. One derived colour: the done-bar track and quote bars use
  surface2 on dark themes, and on light ones 35 % of the muted text over surface0 (light surface2
  is near-white and the empty bar vanished). Chips and the Status tag on a highlighted row
  (surface2) switch to surface0 so they stay visible.

## Limits
- Plugins can't open a file in Paseo's file tab or write into the current composer: the viewer is
  built in; chats are new chats.
- Phones: Paseo's compact explorer has no plugin panels (step 4 adds the composer pill).
- Over the app.paseo.sh relay the very first load after a plugin reload takes several seconds.

## Files
`index.server.ts`, `server/` (scan, git, suggest, bindings, service), `shared/` (RPC contracts,
parser, settings), `client/` (panel, effort view, unbound view, search results, marks, Markdown
renderer copied from omp-slash-aliases). Parser tests: `npx vitest run` (real status/blocked-by
variants, symlinked roots). Screenshots: `screenshots/`.
