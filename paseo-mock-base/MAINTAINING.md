# Maintaining the Paseo mock base

Mocks link `kit/` live, so every change here reaches every mock on reload.

- **Additive only.** Add classes, variables and tags; keep existing names
  working. Old mocks depend on them.
- **Fixes land in the base.** A look error or missing piece found while
  building a mock goes into `kit/paseo.css` (plus the starter, if it's
  markup), not into the mock.
- **Source of truth for measurements:** real Paseo.
  The mock base notes folder (path in `~/.config/my-agents/local.md`) holds
  `layout-spec.md` and `ref/` with measured values and screenshots. For a new piece, measure it on
  a test daemon (never Stefan's live one on :6767).
- **After a Paseo update:** `node tools/gen-tokens.mjs && node tools/gen-icons.mjs`
  (both read `sourceCheckout` in `~/.config/my-agents/paseo.json`), then have a subagent export
  `demo/` with `tools/export.mjs` and compare it against the real app.
- `npm install` once here, for `tools/export.mjs` (Playwright).

The pace rule from `README.md` applies here too: link first, checks in the
background.
