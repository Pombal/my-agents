# Provider icons

Custom image icons for **any daemon-known provider**, including built-ins and configured providers such as `omp-nilo`. This is a generic plugin: provider IDs, labels and images are not hardcoded into its rendering logic.

Installed from `/home/cx/workspace/my-agents/paseo-plugins/provider-icons` and enabled on axalon. Refresh the Paseo web app or desktop app to load it.

## Pick or remove an image

1. Open **Settings → Plugins → provider-icons → Actions → Provider icons**, or use Command Center → **Configure provider icons**.
2. Pick a provider from the daemon's list. Each option shows **label (id)**, including disabled providers.
3. Press **Choose image…** to open a real local file picker. The selected file is uploaded into the official host-scoped plugin settings as a data URL; it does not have to exist on axalon and needs no public URL or daemon filesystem path.
4. Choose **SVG, PNG, WebP or JPEG**, at most **128 KiB**, with decoded dimensions at most **4096 × 4096**. Small square transparent images are best. Non-square images are contained, not stretched.
5. Choose another image for the same provider to replace its mapping. Press its **Remove** button to restore Paseo's default glyph immediately.

Settings persist across plugin reloads and are shared by all authorized clients connected to that daemon. Changes apply immediately in the editing client; refresh other already-open clients. The plugin records the owning host ID alongside the mappings so equal provider IDs on another host are not accidentally repainted.

Validation checks the uploaded bytes against the supported MIME type and size, then requires the browser to decode the image before saving. SVGs must be static and self-contained: scripts, event handlers, embedded documents/images, external resources, animation and resource URLs are rejected. Images are rendered as CSS image backgrounds, **never injected as inline SVG/HTML**. The daemon repeats the shared validation through the settings schema. No arbitrary URLs are fetched.

## Initial Nilo mapping

The saved mapping is **`omp-nilo` → `/home/cx/workspace/nilo/public/favicon.svg`**: Nilo's real square green-on-black favicon. The exact original file is used, not a recreated or guessed logo. Only the image bytes and filename are saved; the plugin does not require that repository at runtime and does not bundle the Nilo asset.

A temporary second mapping, **`claude` → `/home/cx/workspace/nilo/public/favicon.png`**, was exercised to prove that built-in providers can also be overridden. It was removed afterward. Final saved configuration contains **only `omp-nilo`**.

## Coverage inventory

The source inventory below comes from Paseo's `packages/app/src` provider-icon consumers, plus its independent ACP catalog renderer. “Live” means exercised in the hosted web app; the other rows describe implemented ownership adapters read in code, not separate live acceptance claims.

| Place | Coverage / evidence |
| --- | --- |
| Model picker header, model rows and composer model trigger (`components/model-browser.tsx`, `composer/agent-controls/model-sheet.tsx`) | Covered; **live**, including navigation and a fresh document load. |
| Provider/model picker used by new-agent and new-workspace screens | Covered by the same model-browser provider-owner adapter. [INFERENCE] Not separately opened during acceptance. |
| Installed-provider settings list (`screens/settings/providers-section.tsx`) | Covered; **live** for Nilo and a temporary built-in Claude override. Chevron, switch and action-menu icons are not replaced. |
| Provider settings/detail rows and provider-bound terminal profile glyphs (`screens/settings/host-page.tsx`, `components/terminal-profile-icon.tsx`) | Covered through `iconKey` ownership; read in code. |
| Add-provider ACP catalog tiles (`components/provider-catalog-list.tsx`) | Covered through `provider-catalog-tile-<id>`; read in code. A catalog ID can be mapped once it is known to the daemon. |
| Agent tabs and their header/tab presentations (`panels/agent-panel.tsx`, `screens/workspace/workspace-tab-presentation.tsx`, desktop and compact tab rows) | Covered by tab target → daemon agent ID → exact provider ID; **live** on two Nilo agent tabs. Original 14 × 14 glyph boxes were preserved. |
| Agent history/search list rows (`components/agent-list.tsx`) | Covered through the row's `agent.provider`; read in code. Workspace sidebar project icons and status dots are not provider glyphs and intentionally remain unchanged. |
| Subagent track rows, provider-native subagent tabs and draft-agent tabs (`subagents/track.tsx`, `panels/provider-subagent-panel.tsx`, `workspace-tabs/model.ts`) | Covered through row provider, parent agent ID or draft setup provider; code-read and unit-tested, not separately opened live. |
| Import-session rows and provider filter options/trigger (`components/import-session-sheet.tsx`) | Covered through session provider IDs and explicitly bounded provider-filter controls; code-read and unit-tested. |
| Schedule rows and schedule-form provider glyphs (`components/schedules/schedule-row.tsx`, `schedule-form-sheet.tsx`) | Covered through their provider-glyph wrapper; read in code. |
| Command Center model choices (`command-center/agent-control-contributions.ts`) | Covered through `command-center-model-<host>:<provider>:<model>` identity; code-read and unit-tested. Thinking/mode/feature icons remain unchanged. |

## Implementation and limits

- **Web and Electron desktop only. Native iOS/Android phone apps cannot have their app glyphs replaced by a DOM plugin.** A phone browser running the web app is different from the native phone app.
- Paseo 0.11.4 has no official provider-icon override API. This plugin observes web DOM changes and reads React's attached ownership metadata to associate an SVG with its exact provider or agent. It does not identify every robot as Nilo or guess by substring-matching labels.
- It keeps the existing SVG element, dimensions, alignment and React-owned children. Scoped CSS paints the chosen image and hides only the original glyph's children. Square provider glyphs are eligible; unrelated Lucide actions and non-glyph tab scrims remain untouched. Removal/disable removes the attributes and style and reveals the original icon.
- A MutationObserver coalesces work into at most one animation-frame scan per change batch; it does not watch streamed text mutations or poll the DOM. Agent IDs are loaded through the official paginated SDK and updated by its agent subscription.
- React ownership details and Paseo markup are private integration points. An upstream change may require updating the adapters. Unidentified elements retain Paseo's original icon rather than guessing. Native clients are deliberately a no-op.
- Maximum 32 mappings. Image changes do not modify daemon provider configuration, provider labels, `extends`, or built-in icon assets.

## Disable / develop

Disable **provider-icons** under Settings → Plugins, or run:

```sh
paseo plugin disable provider-icons
```

Re-enable with `paseo plugin enable provider-icons`; settings are retained. For local source edits:

```sh
paseo plugin reload provider-icons
```

Logic tests (Bun):

```sh
cd /home/cx/workspace/my-agents/paseo-plugins/provider-icons
bun test tests
```

Tests cover supported real raster exports, SVG safety rules, MIME spoofing, size limits, exact mapping resolution/upsert/removal, tab/agent disambiguation, provider filters, command/catalog identity and host ownership.

## Live screenshots

All screenshots were taken from an owned Chromium tab connected to the installed daemon, not from a mocked UI:

- `screenshots/settings-nilo.png` — saved Nilo-only mapping and real image picker control.
- `screenshots/model-picker-nilo.png` — Nilo image in the model-picker header and model rows.
- `screenshots/agent-tabs-nilo.png` — Nilo images in two existing agent tabs and the composer trigger.
- `screenshots/providers-nilo.png` — provider settings row with Nilo image.
- `screenshots/mapping-removed.png` — empty mappings after Remove.
- `screenshots/providers-default-restored.png` — default Bot glyph restored after removal.
- `screenshots/settings-two-providers.png` — temporary Nilo + Claude mappings.
- `screenshots/providers-two-mappings.png` — both custom icons rendered, including built-in Claude. The Claude mapping was subsequently removed.
