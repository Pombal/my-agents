# Popular themes

## Inventory before installation (2026-10-19)

The running Paseo app's Settings → Appearance → Theme menu contains **Light, Dark, System, Zinc, Midnight, Claude, Ghostty, Pure black, T3 Chat Dark, T3 Chat Light**. System is an automatic selection, not an additional palette. The first eight entries are built in; the final two come from the enabled local `t3-chat-theme` plugin. This inventory was read live before creating any theme contribution.

All installed plugin sources were searched for `addTheme`. The only other theme-capable installation is **Chat Polish**, currently disabled. Its presets are **One Dark Darker Mariana, Paper, Dusk**, plus a user-editable custom theme; these are not registered in the running app. Its One Dark Darker Mariana is a distinct derivative, not Atom's original One Dark. Its syntax highlighting presets are not app themes.

**Skipped requested families: none.** None of Tokyo Night, Dracula, Rosé Pine, Nord, Gruvbox, original One Dark, GitHub, Solarized, Kanagawa, or Everforest is an existing app theme. The preexisting T3 plugin is left untouched.

## Installed themes and official sources

This is a palette port, not a complete editor-theme port. It includes one canonical dark palette and its official light counterpart per family, not every alternate dark flavor or hard/soft contrast preset. Nord's original is dark only; no invented “Nord Light” is included. One Light is Atom's official companion to One Dark; Dracula's official light companion is Alucard.

| Family | Settings menu entries | Official palette source |
| --- | --- | --- |
| Tokyo Night | Tokyo Night; Tokyo Night Light | [Original Tokyo Night palette](https://github.com/enkia/tokyo-night-vscode-theme#color-palette); supplemental neutral surfaces from [Tokyo Night Neovim](https://github.com/folke/tokyonight.nvim/tree/main/lua/tokyonight/colors) and its [generated day palette](https://github.com/folke/tokyonight.nvim/blob/main/extras/kitty/tokyonight_day.conf) |
| Dracula | Dracula; Dracula Alucard | [Official Dracula specification: Classic, Alucard, UI and ANSI palettes](https://draculatheme.com/spec) |
| Rosé Pine | Rosé Pine; Rosé Pine Dawn | [Official main and dawn palettes](https://github.com/rose-pine/neovim/blob/main/lua/rose-pine/palette.lua), [palette guide](https://rosepinetheme.com/palette/) |
| Nord | Nord | [Official Nord CSS palette and role descriptions](https://github.com/nordtheme/nord/blob/develop/src/nord.css) |
| Gruvbox | Gruvbox Dark; Gruvbox Light | [Original Gruvbox palette](https://github.com/morhetz/gruvbox/blob/master/colors/gruvbox.vim), default medium contrast |
| One | One Dark; One Light | Atom's [One Dark syntax](https://github.com/atom/one-dark-syntax/blob/master/styles/colors.less), [One Light syntax](https://github.com/atom/one-light-syntax/blob/master/styles/colors.less), [dark UI levels](https://github.com/atom/one-dark-ui/blob/master/styles/ui-variables-custom.less), [light UI levels](https://github.com/atom/one-light-ui/blob/master/styles/ui-variables-custom.less) |
| GitHub | GitHub Dark; GitHub Light | [Official GitHub theme and foreground overrides](https://github.com/primer/github-vscode-theme/blob/main/src/colors.js); its pinned Primer Primitives 7.10.0 [dark](https://cdn.jsdelivr.net/npm/@primer/primitives@7.10.0/dist/json/colors/dark.json) and [light](https://cdn.jsdelivr.net/npm/@primer/primitives@7.10.0/dist/json/colors/light.json) palettes |
| Solarized | Solarized Dark; Solarized Light | [Original Solarized palette and usage](https://github.com/altercation/solarized#usage-development) |
| Kanagawa | Kanagawa Wave; Kanagawa Lotus | [Official Kanagawa palette](https://github.com/rebelot/kanagawa.nvim/blob/master/lua/kanagawa/colors.lua) |
| Everforest | Everforest Dark; Everforest Light | [Official Everforest medium palettes](https://github.com/sainnhe/everforest/blob/master/autoload/everforest.vim) |

## Token mapping and readability

The client uses Paseo's supported eight-color `addTheme` palette:

- `background` / `foreground`: canonical editor base and readable primary text.
- `raised` / `control`: official panel, overlay, or nearby background swatches. Some are intentionally shared when the next surface step would compromise text or accent contrast.
- `border`: a restrained separator from the official neutral ladder.
- `accent`: a recognizable official blue, purple, green, or neutral. Paseo also uses this as text and as a filled control with `background`-colored text, so it must remain readable.
- `mutedForeground`: an official secondary foreground when it reaches AA; otherwise a stronger official swatch. Original low-contrast editor comments are not suitable for small UI labels.
- `ring`: a contrast-bearing official focus color. Paseo also reuses it for extra-muted foreground.

Specific adaptations:

- Dracula uses official ANSI bright blue for its accent and muted text rather than the lower-contrast purple/comment colors on selected controls.
- Rosé Pine uses `subtle` for dark secondary text, but Dawn uses `text` rather than low-contrast `muted`/`subtle`.
- Nord uses `nord6` / `nord4` for primary / secondary text, `nord8` for accent, and caps interactive surfaces at `nord1`.
- Gruvbox uses bright aqua in dark mode, faded blue in light mode, and stronger foreground ladder entries for secondary text.
- One uses Atom's HSL values converted to hex; panel/control/border shades follow its official UI level formulas. One Light uses purple rather than its brighter blue for readable accent text.
- GitHub uses its official ANSI blue as accent and the stronger unmodified Primer secondary text where the VS Code override would be too dim.
- Solarized uses higher-contrast official monotones for UI text and accent: `base1` in dark mode and `base02` in light mode. This retains the original base backgrounds without introducing non-Solarized colors.
- Kanagawa Wave caps controls at `sumiInk4`; Lotus uses `lotusInk2` as accent rather than lower-contrast `lotusBlue4`.
- Everforest uses its main foreground for secondary text and, in light mode, accent, since the standard muted/green swatches do not meet AA for small UI text.

WCAG sRGB relative-luminance calculations were run for every theme. The table gives the **worst** ratio against all three contributed surfaces (`background`, `raised`, `control`), not just the easiest background. Primary, secondary, and accent text all exceed **4.5:1**; focus rings exceed **3:1**. These checks cover the contributed palette, not a claim that every inherited host status/syntax color or translucent interaction state is AA.

| Theme | Primary minimum | Secondary minimum | Accent minimum |
| --- | ---: | ---: | ---: |
| Tokyo Night | 8.32 | 6.36 | 5.33 |
| Tokyo Night Light | 8.49 | 7.61 | 5.23 |
| Dracula | 8.59 | 4.88 | 4.88 |
| Dracula Alucard | 13.98 | 4.90 | 5.30 |
| Rosé Pine | 11.51 | 4.71 | 7.25 |
| Rosé Pine Dawn | 7.92 | 7.92 | 5.09 |
| Nord | 8.73 | 7.45 | 5.03 |
| Gruvbox Dark | 8.45 | 5.32 | 5.51 |
| Gruvbox Light | 8.45 | 4.75 | 4.81 |
| One Dark | 5.29 | 5.29 | 4.77 |
| One Light | 9.43 | 9.43 | 5.09 |
| GitHub Dark | 12.88 | 4.95 | 6.03 |
| GitHub Light | 14.84 | 6.00 | 4.88 |
| Solarized Dark | 4.86 | 4.86 | 4.86 |
| Solarized Light | 10.61 | 10.61 | 10.61 |
| Kanagawa Wave | 9.75 | 7.69 | 5.14 |
| Kanagawa Lotus | 5.00 | 5.00 | 6.27 |
| Everforest Dark | 5.57 | 5.57 | 4.70 |
| Everforest Light | 4.66 | 4.66 | 4.66 |

## Installation, selection, and removal

```sh
paseo plugin install /home/cx/workspace/my-agents/paseo-plugins/popular-themes
```

Refresh the app, then choose **Settings → Appearance → Theme**. The install is a local-directory registration, so no package build, copied dist, server component, or dependencies are needed.

Each individual variant is one independent, named `// Theme name` object block in the `themes` array in `index.client.ts`. To remove a theme, delete that entire object and its comment; nothing else imports or references it. To remove a family, delete its one or two objects. Then:

```sh
paseo plugin reload popular-themes
```

Refresh the app. If a removed theme was selected, Paseo falls back to its default preference. Choose a retained theme first to avoid a surprise. The returned cleanup unregisters all contributions on disable/reload.

## Live acceptance evidence

On 2026-10-19, local installation returned `enabled: true`, `status: running`. After refreshing a dedicated paired `https://app.paseo.sh/` tab, all **19** new menu entries were present alongside the built-ins and both T3 themes. Every new theme was actually clicked in the menu; each persisted `theme: "plugin"` and its own `popular-themes/theme/<id>` selection. A screenshot was captured after every selection, and the resulting [contact sheet](screenshots/contact-sheet.webp) was visually inspected. Four full-size representative captures are also retained:

- [Tokyo Night dark](screenshots/tokyo-night-dark.webp)
- [Tokyo Night light](screenshots/tokyo-night-light.webp)
- [Rosé Pine dark](screenshots/rose-pine-dark.webp)
- [Rosé Pine Dawn](screenshots/rose-pine-dawn.webp)

The original selection was **System** (`theme: "auto"`) with inactive remembered `pluginThemeId: "t3-chat-theme/theme/dark"`. Both values were restored through the UI, and the dedicated tab was closed. No other theme/plugin toggles were changed. The browser reported no errors during the acceptance check.

The installed 0.11.4 web bundle was separately inspected for its built-in theme list; it matches the initial live inventory above. The app's syntax-theme picker is independent and was intentionally left unchanged.
