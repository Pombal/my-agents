Filter presets adds a compact row of All, Nilo, and Other buttons to the web sidebar. Choose a button or use the Command Center entries named “Filter preset: …”. All is the initial selection. Other appears only when at least one project matches no preset. Projects can match more than one preset and appear in each.

Requires Paseo 0.12.0 or later. Native iOS and Android clients receive no buttons, commands, or settings screen.

## Definitions

Open Settings → Plugins → Filter presets → Filter presets. Each preset is a card with its name, its rules, and a live preview. A project is included when any of its rules matches. Definitions are stored on the daemon and shared with its connected clients. Nothing changes until you press Save; Discard changes returns to the saved definitions.

Each rule is a type and a value:

- **Inside folder**: an absolute directory path. Matches that directory and everything below it, not similarly named neighbors. Example: `/home/cx/workspace/work`.
- **Path has a folder named**: a folder name matched against every folder in the project path, anywhere. `*` matches any characters. Example: `nilo-*` matches `/home/cx/workspace/nilo-armory` and `/home/cx/.herdr/worktrees/nilo-x/feature`. One name only, without `/`.
- **Git remote**: a pattern against the remote in Paseo's project key. `nilo-technologies/*` is shorthand for GitHub; a full pattern such as `github.com/nilo-technologies/*` or `gitlab.com/team/*` also works. GitHub patterns ignore case, as Paseo stores GitHub owners and repositories in lower case; other forges are case-sensitive. Repository subdirectory suffixes are ignored.
- **Path pattern**: a case-sensitive pattern against the full project root path. `*` matches any characters except `/`, `**` includes `/`, and `?` matches one non-`/` character. Example: `/home/cx/workspace/nilo-*`.
- **Path regex**: a JavaScript regular expression against the project root path, without surrounding slashes or flags. Add `^` and `$` when you want an anchored match.

Use absolute paths as seen by the daemon. `~` and environment variables are not expanded, so "Inside folder" and "Path pattern" values must start with `/`; the form says so before saving.

The initial Nilo preset has two "Path has a folder named" rules, `nilo` and `nilo-*`: every project whose path contains a folder named `nilo` or starting with `nilo-` (for example `/home/cx/workspace/nilo-armory` or `/home/cx/.herdr/worktrees/nilo/wa-frustrations-alpha`).

Under each preset, "Matches N projects" lists the projects the rules on screen match, including edits you have not saved. Projects that the saved version did not match are outlined in green with a `+`. A rule with a problem (an empty value, an invalid regular expression, a folder name with `/`) shows its error under the field and is left out of the preview. An empty preset name or a preset without rules also shows an error. Save stays disabled until every problem is fixed.

The Other card lists the projects no preset matches, with their paths. It shows the first five; "+ N more" shows the rest. Each row has an "Add to" menu: choosing a preset adds a rule for exactly that project, and "New preset…" creates a preset named after the project with that rule. The rule is "Inside folder" with the project's path, or "Path pattern" with the exact path when another project lives inside that folder (for example `/mnt/obsidian-vault` contains `/mnt/obsidian-vault/Infra - Ofis`), so only the chosen project is added. Review the preview and press Save to keep it. While the pointer is over the Other card, projects added or removed elsewhere wait until it leaves, so rows don't move under the pointer.

Save shows the saved state at once and applies it to the sidebar; the daemon confirms it in the background (about 0.3 to 0.6 s through app.paseo.sh). If the daemon refuses, for example because the definitions were changed from another window, the form returns to unsaved with your edits kept and an error toast. "Saving…" appears only if the daemon takes longer than 0.8 s.

"+ Add preset" adds an empty card. A new preset gets its ID from its name when saved (`Client Work` becomes `client-work`, with a number added if the ID is taken). Renaming a saved preset keeps its ID, so the sidebar selection stays.

### Edit as JSON

"Edit as JSON" swaps the form for the raw definitions; "Edit with form" goes back. Save checks the whole array the same way: valid rules, regular expressions, and unique IDs. "Reset to Nilo" there restores the initial definition. An agent can edit the same host-side settings document under the plugin's `presets` settings ID. Each preset has an `id`, a display `name`, and one or more `rules`. IDs start with a lowercase letter and contain lowercase letters, digits, or hyphens. `all` and `other` are reserved. Rule types in JSON: `folderPrefix` (Inside folder), `folderName` (Path has a folder named), `remoteGlob` (Git remote), `pathGlob` (Path pattern), `pathRegex` (Path regex).

```json
[
  {
    "id": "nilo",
    "name": "Nilo",
    "rules": [
      { "type": "folderName", "value": "nilo" },
      { "type": "folderName", "value": "nilo-*" }
    ]
  }
]
```

## Selection

The selected button is browser-local and survives page and plugin reloads using `paseo-plugin:filter-presets:selected`. Definitions changing or a missing Other group can make the effective selection fall back to All.

## Behavior and limits

The plugin reads the selected host's project names, root paths, and project keys through Paseo's existing connection. It hides unmatched sidebar project groups and their workspace rows using the web sidebar's `data-testid` hooks. Disabling it removes its stylesheet and restores those groups. It does not alter Paseo's Project filter, delete projects, or prevent opening a workspace elsewhere. No data is sent to a third-party service.

Both sidebar groupings are filtered: "group by project" hides whole project groups, "group by status" hides the individual workspace rows of non-matching projects, and a status section whose rows are all hidden disappears with its heading. A section with "Show more" stays (its unshown rows may match), and its count still includes hidden rows. Pinned workspace rows are never filtered, in either grouping. Built-in Project filters and collapsed project groups still affect what is shown. These are sidebar display presets, not access controls.

The plugin keeps a live workspace list from the daemon, so a workspace created in a hidden project is hidden about half a second after it appears in "group by status" (measured 0.5 s through app.paseo.sh; the gap is the project lookup for a brand-new project). The project list is reused for 30 s (opening settings shows it at once without a refetch) and refreshed immediately when the daemon reports a project change. Switching presets costs about 1 to 3 ms before the sidebar restyles. After a page load the sidebar shows every project for about a second until the definitions and project list arrive.
