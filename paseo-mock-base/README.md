# Paseo mock base

A static replica of Paseo's normal screen plus a tiny engine for design mocks.
Use it for every Paseo plugin mockup: copy the starter, edit only what you are
designing, tag the differences. Served at `http://axalon:8080/pages/paseo-base/`
(symlink `~/www/webshare/pages/paseo-base` → this folder).

## Make a mock

1. `cp -r ~/workspace/my-agents/paseo-mock-base/starter ~/www/webshare/pages/<plugin>-mocks`
2. Edit `index.html` there. Keep the two kit lines in `<head>`:
   `<link rel="stylesheet" href="/pages/paseo-base/kit/paseo.css">` and
   `<script src="/pages/paseo-base/kit/dev.js" defer></script>`.
3. Open `http://axalon:8080/pages/<plugin>-mocks/`.
4. Export PNGs for chat: `node ~/workspace/my-agents/paseo-mock-base/tools/export.mjs http://axalon:8080/pages/<plugin>-mocks/`
   (writes `~/www/webshare/images/<plugin>-mocks-<section>-<variant>-<viewport>.png`).

`demo/` is a worked example of every mechanism below (search it for `DEMO:`).

## Two kinds of controls (keep them apart)

- **Design** (top bar, amber): which design option is shown. Sections and variants.
- **Situation** (bottom bar, violet, part of the workbench like the canvas): where the chosen design is shown. Theme,
  viewport and app state (empty chat, crashed agent, panel open…). A situation
  never changes the design; a variant never changes the situation.

Both bars build themselves from tags. There is no config file. The bars carry
no headings: their position and colour say which is which. A bar with nothing
to offer is not shown (the starter has no design bar).

## Tags

| Tag | Where | Effect |
|---|---|---|
| `data-section="id" data-title="Label"` | a top-level screen (e.g. `.app`) | One Design button per section. No sections → whole body is one screen. |
| `data-variants="A: Label — note \| B: Label"` | the section | Variant buttons, in this order. `— note` shows as a quiet caption under the bar (its line is reserved, so flipping moves nothing). Optional: ids are otherwise collected from `data-variant`. |
| `data-variant="B C"` | any element | Exists only in those variants. Tag the **difference only**; never copy a whole screen per variant. |
| `data-viewport="phone"` | any element | Exists only in that viewport: `desktop`, `laptop`, `phone`, or `wide` (= desktop + laptop). |
| `data-states="session: normal \| empty \| crashed; …"` | `<html>` or a section | Declares app-state axes; first value is the default. |
| `data-when="session: empty crashed"` | any element | Exists only in those states. Several axes: separate with `;`. A state control is hidden while none of its elements can appear (e.g. a phone-only drawer on desktop). |
| `data-cycle="Off \| 30 min \| 1 h"` | a button inside the mock | Kit **cycle button**: left third steps back, the rest steps forward (wraps); the hovered side shades from its edge. Width fixed to the widest value. Add `data-cycle-chevrons` for faint ‹ › that light up on the hovered side (the dev bars use them). Fires `cycle` with `{ value, index }`. |
| `data-scroll="bottom"` | a scroll area | Shows its end, like a chat scrolled to the latest turn. |
| `<i data-icon="name" data-size="14">` | anywhere | Lucide icon (Paseo's set, stroke 1.5, default 16px). Non-Lucide icons: `kit/icons-extra.js` (e.g. `provider-omp`). |
| `data-mock-title`, `data-themes`, `data-viewports` | `<html>` | Title in the Design bar; theme list (default `dark pureBlack light`); viewport list (default `desktop laptop phone`). |

The frame carries the current situation for CSS: `data-v="B"`, `data-vp="phone"`,
`data-theme="pureBlack"`, `data-state-session="empty"`, `data-section="chat"`.
So variant-only styling is plain CSS: `[data-v="B"] .composer { … }`.

URL keeps the place: `#chat/B?theme=pureBlack&vp=phone&session=empty`. Keys:
← → variant, ↑ ↓ section, `t` theme, `v` viewport. JS hooks (only if a mock
needs behaviour): `MockKit.set({...})`, `MockKit.onChange(fn)`, `mockchange` /
`mockready` events.

## Styling

- Colours, font sizes, spacing, radii: CSS variables from `kit/tokens.css`,
  generated from Paseo's `theme.ts` (`--c-surface1`, `--c-foreground-muted`,
  `--c-border-accent`, `--c-status-danger`, `--fs-content`, `--r-lg`, …).
  Never hard-code a hex colour that has a token; it breaks the other themes.
- Components: classes in `kit/paseo.css` (`.sidebar`, `.sb-ws`, `.tabs`, `.tab`,
  `.msg-user`, `.msg-text`, `.tool-row`, `.turn-footer`, `.pills`, `.pill`,
  `.composer`, `.cbtn`, `.right-panel`, `.phone-header`, `.drawer`, …). Read the
  starter for how they nest.
- Mock-only CSS goes in the mock's own `<style>`.

## Changing the base

- Fix or add to `kit/paseo.css` and the starter when Paseo's look is wrong or a
  piece is missing; every mock picks up CSS fixes on reload.
- **Add classes and variables; never rename or remove them.** Old mocks use them.
- Measurements and reference screenshots:
  `/home/cx/agentspace/index/.scratch/paseo-mock-base/layout-spec.md` and `ref/`.
- After a Paseo update: `node tools/gen-tokens.mjs && node tools/gen-icons.mjs`
  (reads `~/forkspace/paseo-wt/axalon`), then export `demo/` and eyeball it.
- `npm install` here once for the export tool (Playwright).
