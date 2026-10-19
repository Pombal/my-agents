# Provider icons

Custom image icons for **any provider the daemon knows**, built-in (`claude`, `omp`, …) or config-defined (`omp-nilo`, for which Paseo draws a robot). Generic: no provider ids, labels or images are hardcoded.

Installed from `/home/cx/workspace/my-agents/paseo-plugins/provider-icons` and enabled on axalon. Refresh the Paseo web or desktop app after a plugin reload.

## Use it

Open **Settings → Plugins → provider-icons → ⋯ → Provider icons** (or Command Center → **Configure provider icons** while a workspace is open; Paseo hides plugin commands on host-less pages such as History).

- Every provider is one row: label, id, and either **Paseo default** or the saved file name. Providers with a custom icon are listed first.
- **Choose…** / **Replace…** opens the local file picker. SVG, PNG, WebP or JPEG, ≤ 128 KiB, ≤ 4096 × 4096 px. The bytes are stored in the plugin's host-scoped settings, so the file does not need to stay on disk.
- The preview shows the icon at its real 16 px on the current theme and on the opposite one.
- **Color / Mono**: Color paints the image as drawn. Mono uses only its shape and paints it in the color Paseo gives the glyph at that spot (muted in lists, full contrast in the composer), so a transparent-background mark follows the theme like Paseo's own icons. Mono on an image with an opaque background gives a solid square; use Color for those.
- **Remove** restores Paseo's glyph immediately.
- Errors (wrong type, too big, undecodable, unsafe SVG, rejected save) appear under the row they belong to.
- Other open windows pick up changes when they regain focus; no refresh needed.

SVGs must be static and self-contained (no scripts, event handlers, embedded documents/images, external URLs or animation). Images are painted as CSS backgrounds or masks, never inserted as inline SVG/HTML. The daemon re-validates through the settings schema.

## Current mapping

**`omp-nilo` → `/home/cx/workspace/nilo/public/favicon.svg`**, Color. This is Nilo's real favicon (green mark on a black rounded square), byte-identical to the file (checked against the saved settings document). Nothing else is mapped.

## Where it applies

Checked live on the hosted web app (app.paseo.sh, Paseo 0.12.0) against the 0.11.4 daemon on 2026-10-19, unless marked "code".

| Place | How the owner is found | Evidence |
| --- | --- | --- |
| Agent tabs | `workspace-tab-agent_<agentId>` → agent's provider | live |
| Composer model trigger | component props (`provider`) | live |
| Model picker: header, provider list, model rows | `model-provider-<id>`, `model-row-<provider>-<model>` (longest known id, so `omp-nilo` ≠ `omp`), header via props | live |
| Sub-agent strip rows | props (`row.provider`) | live |
| History (`/sessions`) rows | `agent-row-<serverId>-<agentId>` | live (was broken before this review) |
| Command Center model choices | `command-center-model-<host>:<provider>:…` | live |
| Settings → Providers list | props (`def.id`) | live (Color and Mono) |
| Add-provider catalog tiles | `provider-catalog-tile-<id>` | live (none mapped) |
| Schedule rows and schedule form | props (`provider`) | live (no mapped schedule) / code |
| Import-session rows and provider filter | props; filter trigger by its exact `Filter: <label>` | code |
| Provider-native sub-agent tabs, draft tabs | props (tab target → parent agent / draft setup) | code |
| Terminal-profile glyphs (`iconKey`) | props | live (none mapped) |

Not provider glyphs, left alone: sidebar workspace rows (project favicons and status dots), the Bot in sub-agent tool-call badges, Settings → Agents nav icon, PR/check badges, the context meter. Native phone apps cannot be changed by a web plugin; a phone *browser* running the web app works.

## How it works

Paseo has no icon-override API in 0.11.4 or 0.12.0 (only plugin-registered providers can ship an SVG, and config providers like `omp-nilo` cannot). So the plugin finds glyphs in the web DOM:

1. **Glyph shape filter**: a square `<svg>` ≤ 64 px that is either one of Paseo's provider marks (no Lucide class) or Lucide `bot` / `package-plus` (Paseo's fallbacks). Other Lucide icons are skipped without further work.
2. **Owner, tier 1 — `data-testid`** of the nearest test-id ancestor (table above). Paseo's e2e tests rely on these ids, so they are the most stable hook; several include the host id.
3. **Owner, tier 2 — React props** of the components above the glyph (`provider`, `iconKey`, `def.id`, `agent.provider`, `row.provider`, tab targets …), read from React's `__reactFiber$` node metadata, read-only. Needed because the composer trigger, picker header, settings rows, sub-agent rows and schedules expose no provider id in the DOM. All prop names were checked identical in the 0.11.4 and 0.12.0 sources.
4. **Host check**: the glyph's host (test id, `serverId`/`agent.serverId` prop, else `/h/<id>` or `/settings/hosts/<id>` route) must equal the host the mappings belong to, so equal provider ids on another host are not repainted.
5. Matched SVGs get two data attributes; a scoped stylesheet paints the image (or mask) and hides only the SVG's children. React keeps owning the element; removing a mapping or disabling the plugin removes the attributes and stylesheet.

Agent → provider comes from the official SDK (`agents.list`, `agents.subscribe`), provider ids/labels from `providers.snapshot()`.

**Cost**: one `MutationObserver` on `body` (child list plus a few attributes; no text changes), coalesced to at most one scan per animation frame and only while a mapping exists. A scan measured 0.06–0.09 ms with ~180 SVGs on screen; while an agent streamed, scans ran 7 times in 10 s.

**Durability**: if Paseo renames test ids, tier 2 still covers those spots; if React's fiber key or Paseo's prop names change, tier 1 still covers tabs, picker rows, history and Command Center. If both break, glyphs fall back to Paseo's defaults; nothing is guessed from labels except the import filter trigger.

## Disable / develop

```sh
paseo plugin disable provider-icons      # settings are kept
paseo plugin enable provider-icons
paseo plugin reload provider-icons       # after editing source
cd /home/cx/workspace/my-agents/paseo-plugins/provider-icons && bun test tests
```

Tests: test-id and prop owner resolution using ids copied from the live app (incl. `omp` vs `omp-nilo` prefixes, host extraction, non-owner containers), image validation against real PNG/JPEG/WebP exports and unsafe SVGs, mapping upsert, and the settings row model (custom first, orphaned mappings kept removable).

## Screenshots (live, hosted web app, dark theme)

- `screenshots/settings.webp`: settings screen with the Nilo mapping.
- `screenshots/settings-row-mono.webp`: a temporary Mono mapping (transparent Nilo glyph on `claude`) and its two-theme preview. Removed afterwards.
- `screenshots/providers-claude-mono-nilo-color.webp`: Settings → Providers with that temporary Mono Claude icon in the theme's glyph color and Nilo in Color.
- `screenshots/workspace-tabs-composer.webp`: Nilo icon in two agent tabs and the composer model trigger.
- `screenshots/model-picker.webp`: model picker header and rows.
- `screenshots/history.webp`: History rows for `omp-nilo` agents.
