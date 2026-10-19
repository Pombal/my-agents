# Personal style overrides

Stefan's small visual tweaks, kept together in `client/overrides.ts` rather than scattered through
Paseo or several plugins. The first tweak tightens the left sidebar: workspace/new-workspace rows
are 28px instead of 36px and project headers are 32px instead of 40px, with smaller bottom gaps.
Text size, horizontal indentation, colors, hover states and menus stay Paseo's own. Rows can still
grow for extra content; these are minimum heights, not fixed heights.

Client-only, for the web and desktop apps (React Native Web). No daemon code, no restart, no
phone layout changes, and no new setting to find: it applies automatically while enabled.
Disable with `flock /tmp/paseo-plugin.lock paseo plugin disable style-overrides`; enable again with
`flock /tmp/paseo-plugin.lock paseo plugin enable style-overrides`. Disabling removes the plugin's
style element and restores Paseo's layout. If an already-open app has not picked up a plugin
change, refresh that app once.

## How to add a tweak

1. Find the target in the live web DOM. Prefer a specific `data-testid` or accessible `aria-*`
   selector, then check the source to understand the element. Never use generated/hashed classes
   or broad selectors that restyle unrelated screens.
2. Screenshot the relevant screen before editing. Add one grouped CSS block to
   `client/overrides.ts`, with the date and Stefan's wording of what he wanted. For a revision to
   an existing tweak, edit that block. Keep the tiny injector and client entrypoint unchanged.
3. Run `flock /tmp/paseo-plugin.lock paseo plugin reload style-overrides`. Do not restart the
   daemon. Refresh the browser only if it does not receive the reload automatically.
4. Screenshot after, check hover, menus, selection, and expanded/collapsed or nested states near
   the change. Save small screenshots under `screenshots/`. Check disable restores the original
   layout, then re-enable. Keep the plugin enabled when finished.

## Limits

The 28px rows are intentionally compact for mouse/trackpad use, not phone-sized touch targets.
Only rows marked by the three sidebar `data-testid` prefixes in the CSS are affected; nested agent
rows retain their own layout. A Paseo upgrade that renames those IDs or changes row contents may
need an updated rule. No React-owned nodes or inline styles are modified: cleanup removes the
single `<style data-plugin="style-overrides">` element.

## Live proof (2026-10-19, Paseo 0.11.4 web)

`screenshots/sidebar-before.webp` and `sidebar-after.webp` show the same sidebar before and after
installation. Measured workspace/new-workspace rows: 36 → 28px; project headers: 40 → 32px.
Font sizes stayed unchanged. The plugin arrived in the already-open app without a refresh.
`sidebar-row-menu.webp` shows the workspace menu opening on hover; project actions also opened.
`sidebar-collapsed.webp` shows the index project collapsed; expanding restored its workspace rows.
`sidebar-extra-content.webp` shows a workspace with PR/check metadata: the row grows to 44px,
keeping both lines readable. No separate nested agent rows were present in this sidebar.
`sidebar-disabled.webp` shows the original spacing restored after disabling: zero plugin style
elements and the original 36/40px row heights. Re-enabling and reloading left the plugin running.

