Filter presets adds a compact row of All, Nilo, and Other buttons to the web sidebar. Choose a button or use the Command Center entries named “Filter preset: …”. All is the initial selection. Other appears only when at least one project matches no preset. Projects can match more than one preset and appear in each.

Requires Paseo 0.12.0 or later. Native iOS and Android clients receive no buttons, commands, or settings screen.

## Definitions

Open Settings → Plugins → Filter presets → Filter presets to edit the JSON array and save it. Definitions are stored on the daemon and shared with its connected clients. An agent can edit the same host-side settings document under the plugin's `presets` settings ID. The editor validates the entire array, including regular expressions and unique IDs, before saving.

Each preset has an `id`, a display `name`, and one or more `rules`. IDs start with a lowercase letter and contain lowercase letters, digits, or hyphens. `all` and `other` are reserved. Any matching rule includes the project:

```json
[
  {
    "id": "nilo",
    "name": "Nilo",
    "rules": [{ "type": "pathRegex", "value": "(?:^|/)nilo(?:-[^/]*)?(?:/|$)" }]
  }
]
```

The initial Nilo definition includes every project whose path contains a folder named `nilo` or starting with `nilo-`, anywhere (for example `/home/cx/workspace/nilo-armory` or `/home/cx/.herdr/worktrees/nilo/wa-frustrations-alpha`).

- `folderPrefix`: an absolute directory path, matching that directory and descendants, not similarly named neighbors. Example: `/home/cx/workspace/work`.
- `pathGlob`: a case-sensitive pattern against the full project root path. `*` matches any characters except `/`, `**` includes `/`, and `?` matches one non-`/` character. Example: `/home/cx/workspace/nilo-*`.
- `pathRegex`: a JavaScript regular expression against the project root path, without surrounding slashes or flags. Add `^` and `$` when you want an anchored match.
- `remoteGlob`: the same glob syntax against the remote in Paseo's project key. `nilo-technologies/*` is shorthand for GitHub; a full pattern such as `github.com/nilo-technologies/*` or `gitlab.com/team/*` also works. The `remote:` prefix is optional. Repository subdirectory suffixes are ignored.

Use absolute paths as seen by the daemon. `~` and environment variables are not expanded. The selected button is browser-local and survives page and plugin reloads using `paseo-plugin:filter-presets:selected`. Definitions changing or a missing Other group can make the effective selection fall back to All.

## Behavior and limits

The plugin reads the selected host's project names, root paths, and project keys through Paseo's existing connection. It hides unmatched sidebar project groups and their workspace rows using the web sidebar's `data-testid` hooks. Disabling it removes its stylesheet and restores those groups. It does not alter Paseo's Project filter, delete projects, or prevent opening a workspace elsewhere. No data is sent to a third-party service.

Both sidebar groupings are filtered: "group by project" hides whole project groups, "group by status" hides the individual workspace rows of non-matching projects, and a status section whose rows are all hidden disappears with its heading. A section with "Show more" stays (its unshown rows may match), and its count still includes hidden rows. Pinned workspace rows outside project groups are not filtered in project grouping. Built-in Project filters and collapsed project groups still affect what is shown. These are sidebar display presets, not access controls.
