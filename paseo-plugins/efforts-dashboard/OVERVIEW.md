Wayfinder efforts (`.scratch/<effort>/map.md` + `issues/NN-*.md`) inside Paseo, read-only. Built on
Paseo 0.12.0 from the final mockups `http://axalon:8080/pages/efforts-dashboard-mocks-4/` plus the
approved additions in `/home/cx/agentspace/index/.scratch/paseo-grievances/efforts-dashboard-overcorrection-check.md`.

## Status (2026-10-20)
- **Step 1, Efforts tab in the explorer: built and checked live** (web app, dark, 320 and 240 px).
- Step 2 header pill, step 3 global screen + sidebar row, step 4 phone composer pill: **not built yet**.
  The server already answers everything they need (overview with bindings/suggestions, search).

## Where Stefan sees it
Explorer panel → `+` → **Efforts** (also ⌘K "Efforts for this workspace"). Settings → Efforts:
extra folders.

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
  nilo-wayfinder) plus Settings → Efforts → extra folders. `__share__` and `~/tmp-archive` are
  skipped unless listed. `_to_organize_`, hidden folders and folders with no map/issues/Markdown
  are not efforts. No map: title = first `# ` of the biggest top-level `.md`.
- Ticket status = first word of `Status:` (bold, dates and prose allowed) → open / claimed /
  done / parked; unknown words count as open. Blocked = open and a `Blocked by:` ticket here is
  not done; `chat-widgets 08` style references resolve to the other effort; prose blocks nothing.
  next = lowest-numbered open, unblocked, unclaimed ticket.
- Leans on = sibling efforts linked as `../<slug>/` from map.md outside Out of scope; the reason is
  the linking bullet's bold lead or first clause.
- Not committed = `git status` of the repo owning the effort's real path (so the symlinked worktree
  `.scratch` shows nilo-wayfinder's changes).
- Binding: workspace id → effort in `~/.paseo/plugin-data/efforts-dashboard/bindings.json`
  (or "no effort"). Never set silently. Suggestions, in order: the folder's `.omp/RULES.md`,
  `.scratch/<slug>/` mentions in the last 256 KB of the workspace's chats of the last 3 days (3+
  and twice the runner-up), workspace name, newest files (only when no other workspace shares the
  `.scratch`).
- Files are cached by mtime; the client re-reads every 5 s only while the surface is on screen.
  Overview ~170 ms cold, ~30 ms warm on the real roots.

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
