# T3 Chat theme

Adds **T3 Chat Dark** and **T3 Chat Light** to **Settings → Appearance → Theme**.
Pick either theme there; installing does not change your current theme. Refresh an already-open
web/desktop app if the choices have not appeared. Uses Paseo's public theme API on web, desktop,
iOS and Android; only the web app has been tested live.

This is a client-only color theme: no server entry, subprocess, DOM edits or chat-content changes.
Disable with `paseo plugin disable t3-chat-theme`, or choose another theme in Appearance.

## Palette source and mapping

Colors come from **T3_CHAT_THEME** (light `colors` and `variants.dark`) in
[T3 Code's packages/shared/src/themePalettes.ts](https://github.com/pingdotgg/t3code/blob/1451e7cb23034d29774338608368a15d8845df36/packages/shared/src/themePalettes.ts#L241-L395),
not a guessed palette. OKLCH values are converted with the standard OKLab-to-linear-sRGB matrix,
then sRGB encoded and rounded to 8-bit hex: Paseo's theme validator only accepts hex.

| Paseo token | T3 Chat light source | T3 Chat dark source |
|---|---|---|
| background | canvas | canvas |
| foreground | text | text |
| raised | surfaceRaised | surfaceRaised |
| control | sidebar | secondary |
| border | border | border |
| accent | messageActionHover | accentForeground |
| mutedForeground | textMuted | textMuted |
| ring | messageSurface | secondaryForeground |

Paseo uses `control` for the light sidebar and `background` for the dark sidebar, so the light
sidebar keeps T3's lavender, while the dark sidebar shares the chat's plum. Paseo also uses `ring`
for extra-muted labels, but in light themes it also paints the selected sidebar row. Light `ring`
therefore uses T3's pale message surface so selected text stays readable; some extra-muted labels
remain faint, an API limitation. Dark `ring` uses T3's readable secondary text. Light accent uses
the darker original hover pink for contrast.
Dark accent uses T3's pale pink action text because Paseo fixes accent text to the background color;
T3's original deep-pink fill would make those buttons unreadable in Paseo.

Paseo exposes only eight theme tokens. Destructive/error red, warning colors, terminal ANSI colors,
syntax palettes, spacing and T3's sidebar artwork cannot be supplied by this API; they retain
Paseo's defaults. Choose a syntax theme separately in Appearance. Future API changes could require
updating this plugin; there are no private DOM selectors to break.

## Contrast

WCAG sRGB contrast ratios computed against all three supplied text surfaces (`background`,
`raised`, `control`), after hex conversion. Minimums:

| Variant | Normal text | Muted text | Accent text/background |
|---|---:|---:|---:|
| Dark | 12.41:1 | 9.04:1 | 12.42:1 |
| Light | 10.53:1 | 5.49:1 | 5.38:1 |

Normal and muted text exceed the 4.5:1 normal-text threshold. On the light selected sidebar row,
normal text is 10.43:1 and muted text 5.44:1. Light accent clears 4.5:1 on `control` (4.55:1)
and selected rows (4.51:1). Dark extra-muted/ring text clears 8.16:1. Light extra-muted/ring text
does not meet AA (1.19:1 against the main background): Paseo couples that text token with the
selected-row fill, so both cannot be made readable independently through this API.

## Live proof

`screenshots/t3-chat-dark.webp` and `screenshots/t3-chat-light.webp` show the chat and sidebar
together in each variant. The theme was selected only in a managed headless test browser, not
Stefan's app. No daemon restart is needed.
