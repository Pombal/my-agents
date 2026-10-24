# Paseo mock base

A static copy of Paseo's normal screen plus a small engine for flipping
design variants. Every Paseo plugin mockup starts here. Live at
`http://axalon:8080/pages/paseo-base/` (`demo/` shows every feature; search it
for `DEMO:`).

## Pace: link first

Stefan reviews on his own screen, and fast. After every edit, send him the
link, with the hash for the exact view (`…/#chat/B?vp=phone`). The page
updates on reload, so the link is the result. Screenshots, PNG exports,
visual checks and follow-up fixes run in a subagent while you keep talking
with him.

## Build a mock

1. **Copy the starter:**
   `cp -r ~/workspace/my-agents/paseo-mock-base/starter ~/www/webshare/pages/<plugin>-mocks`.
   Done when `http://axalon:8080/pages/<plugin>-mocks/` shows the Paseo screen.
   A plugin settings screen starts from `starter-settings/` instead: Paseo's
   settings page with a plugin screen built from every primitive plugins get.
2. **Add the design as a delta.** Keep one copy of the screen. Add the new UI
   and tag every element that differs between options with `data-variant`.
   Name the options on the section with `data-variants`. Done when flipping
   ← → changes only the parts under decision.
3. **Add the situations the design must survive:** app states (`data-states`,
   `data-when`), phone-only markup (`data-viewport`). Delete starter states
   the design never touches. Done when every state the design reacts to has a
   value in the bottom bar.
4. **Send the link.**

## The bars

- **Top (amber): design.** The options being decided. The first bar holds the
  sections and looks the same on every section. The current section's variants
  sit in a second bar below it; on a section without variants its slot stays
  empty, so nothing moves.
- **Bottom (violet): situation.** Where the chosen option is seen: theme,
  viewport, app state. It belongs to the workbench, like the canvas.

A situation never changes the design, and a variant never changes the
situation. The bars build themselves from the tags below. A bar with nothing
to offer stays hidden.

Nothing in the dev UI may shift when a choice changes; Stefan treats layout
shifts as bugs. A control that exists only after another choice goes in a
bar of its own below, never beside the choice. Option lists are cycle buttons
(fixed width, ‹ ›); a row of buttons is only for the main choice (sections).

## Public-safe content

Stefan publishes screenshots of these mocks (plugin READMEs, before/after
shots). The starters' projects, workspaces, chats and host are fictional, and
mocks keep them that way: no real project, session, host or plugin name of
his, and no UI from his other plugins unless the mock is about it.

## Tags

| Tag | On | Effect |
|---|---|---|
| `data-section="id" data-title="Label"` | a top-level screen | One top-bar button per section. Without sections, the body is one screen. |
| `data-variants="A: Label — note \| B: Label"` | the section | Variants, in order, as a cycle button in the second top bar. `— note` is a caption under the bars; use it for facts that sway the choice ("phones can't show this"). `data-variants-as="buttons"` on the section shows a row of buttons instead, only when the variants are the main thing to compare. |
| `data-variant="B C"` | any element | Exists only in those variants. |
| `data-viewport="phone"` | any element | Exists only in `desktop`, `laptop`, `phone`, or `wide` (desktop + laptop). |
| `data-states="session: normal \| empty \| crashed; …"` | `<html>` or a section | App-state axes; first value is the default. The button reads "normal session"; custom wording: `open=Files open`. |
| `data-when="session: empty crashed"` | any element | Exists only in those states; `;` joins axes. An axis button hides while none of its elements can appear. |
| `data-cycle="Off \| 30 min \| 1 h"` | a button | Kit cycle button: left third steps back, the rest forward; fixed width. `data-cycle-chevrons` adds ‹ ›. Fires `cycle` `{ value, index }`. |
| `data-scroll="bottom"` | a scroll area | Starts scrolled to the end, like a chat. |
| `data-toggle="panel"`, `data-set="drawer: closed"` | a mock control | Click steps that app-state axis, or sets axes (`;` joins). The mock's buttons and the bottom bar share one state, so they never disagree. |
| `data-pick="tabs"` | each item of a group | Click moves the highlight (`is-active`/`is-selected`) within the group. Content stays the same. |
| `data-editable` | a text area | Typable; Enter does nothing. |
| `data-slot="sidebar-header"` | already in the starter | Where real Paseo shows plugin UI: `sidebar-header` (rows under Schedules), `sidebar-footer` (rows above the footer icons, with separator), `composer-pills`, `explorer-tabs`. Put the plugin's markup inside; an empty slot takes no space. Add new slots to the starter, never ad hoc. |
| `<i data-icon="name" data-size="14">` | anywhere | Lucide icon, Paseo's set. Non-Lucide: `kit/icons-extra.js` (`provider-omp`). |
| `data-themes`, `data-viewports` | `<html>` | Override the lists (default `dark pureBlack light`, `desktop laptop phone`). |

The frame mirrors the situation as attributes, so variant styling is plain
CSS: `[data-v="B"] .composer`, `[data-vp="phone"]`, `[data-theme="light"]`,
`[data-state-session="empty"]`.

Keys: ← → variant, ↑ ↓ section, `t` theme, `v` viewport. The hash holds the
whole view. Behaviour, only if a design needs it: `MockKit.set({...})`,
`MockKit.onChange(fn)`, `mockready` event.

## Styling

- Colours, sizes, spacing and radii come from `kit/tokens.css` variables
  (`--c-surface1`, `--c-foreground-muted`, `--fs-content`, `--r-lg`), generated
  from Paseo's theme, so every theme stays right.
- Paseo pieces are classes in `kit/paseo.css`; the starter shows how they nest.
- Mock-only CSS goes in the mock's own `<style>`.

## Changing the kit itself

Fixing Paseo's look, adding a missing piece, or refreshing after a Paseo
update: read `MAINTAINING.md` first.
