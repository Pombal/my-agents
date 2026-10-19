import type { PluginClientContext } from "@getpaseo/plugin/client";

// One independent block per theme. Sources and role adaptations: OVERVIEW.md.
const themes = [
  // Tokyo Night
  {
    id: "tokyo-night", name: "Tokyo Night", appearance: "dark",
    colors: {
      background: "#1a1b26",
      foreground: "#c0caf5",
      raised: "#16161e",
      control: "#292e42",
      border: "#3b4261",
      accent: "#7aa2f7",
      mutedForeground: "#a9b1d6",
      ring: "#7aa2f7",
    },
  },

  // Tokyo Night Light
  {
    id: "tokyo-night-light", name: "Tokyo Night Light", appearance: "light",
    colors: {
      background: "#e6e7ed",
      foreground: "#343b58",
      raised: "#e6e7ed",
      control: "#e1e2e7",
      border: "#b4b5b9",
      accent: "#2959aa",
      mutedForeground: "#40434f",
      ring: "#2959aa",
    },
  },

  // Dracula
  {
    id: "dracula", name: "Dracula", appearance: "dark",
    colors: {
      background: "#282a36",
      foreground: "#f8f8f2",
      raised: "#343746",
      control: "#44475a",
      border: "#6272a4",
      accent: "#d6acff",
      mutedForeground: "#d6acff",
      ring: "#bd93f9",
    },
  },

  // Dracula Alucard
  {
    id: "dracula-alucard", name: "Dracula Alucard", appearance: "light",
    colors: {
      background: "#fffbeb",
      foreground: "#1f1f1f",
      raised: "#efeddc",
      control: "#efeddc",
      border: "#bcbab3",
      accent: "#644ac9",
      mutedForeground: "#6c664b",
      ring: "#644ac9",
    },
  },

  // Rosé Pine
  {
    id: "rose-pine", name: "Rosé Pine", appearance: "dark",
    colors: {
      background: "#191724",
      foreground: "#e0def4",
      raised: "#1f1d2e",
      control: "#26233a",
      border: "#403d52",
      accent: "#c4a7e7",
      mutedForeground: "#908caa",
      ring: "#c4a7e7",
    },
  },

  // Rosé Pine Dawn
  {
    id: "rose-pine-dawn", name: "Rosé Pine Dawn", appearance: "light",
    colors: {
      background: "#faf4ed",
      foreground: "#464261",
      raised: "#fffaf3",
      control: "#f2e9e1",
      border: "#dfdad9",
      accent: "#286983",
      mutedForeground: "#464261",
      ring: "#286983",
    },
  },

  // Nord
  {
    id: "nord", name: "Nord", appearance: "dark",
    colors: {
      background: "#2e3440",
      foreground: "#eceff4",
      raised: "#3b4252",
      control: "#3b4252",
      border: "#4c566a",
      accent: "#88c0d0",
      mutedForeground: "#d8dee9",
      ring: "#88c0d0",
    },
  },

  // Gruvbox Dark
  {
    id: "gruvbox-dark", name: "Gruvbox Dark", appearance: "dark",
    colors: {
      background: "#282828",
      foreground: "#ebdbb2",
      raised: "#3c3836",
      control: "#3c3836",
      border: "#504945",
      accent: "#8ec07c",
      mutedForeground: "#bdae93",
      ring: "#83a598",
    },
  },

  // Gruvbox Light
  {
    id: "gruvbox-light", name: "Gruvbox Light", appearance: "light",
    colors: {
      background: "#fbf1c7",
      foreground: "#3c3836",
      raised: "#f9f5d7",
      control: "#ebdbb2",
      border: "#d5c4a1",
      accent: "#076678",
      mutedForeground: "#665c54",
      ring: "#076678",
    },
  },

  // One Dark
  {
    id: "one-dark", name: "One Dark", appearance: "dark",
    colors: {
      background: "#282c34",
      foreground: "#abb2bf",
      raised: "#21252b",
      control: "#353b45",
      border: "#181a1f",
      accent: "#61afef",
      mutedForeground: "#abb2bf",
      ring: "#61afef",
    },
  },

  // One Light
  {
    id: "one-light", name: "One Light", appearance: "light",
    colors: {
      background: "#fafafa",
      foreground: "#383a42",
      raised: "#ffffff",
      control: "#eaeaeb",
      border: "#dbdbdc",
      accent: "#a626a4",
      mutedForeground: "#383a42",
      ring: "#a626a4",
    },
  },

  // GitHub Dark
  {
    id: "github-dark", name: "GitHub Dark", appearance: "dark",
    colors: {
      background: "#0d1117",
      foreground: "#e6edf3",
      raised: "#161b22",
      control: "#21262d",
      border: "#30363d",
      accent: "#58a6ff",
      mutedForeground: "#8b949e",
      ring: "#58a6ff",
    },
  },

  // GitHub Light
  {
    id: "github-light", name: "GitHub Light", appearance: "light",
    colors: {
      background: "#ffffff",
      foreground: "#1f2328",
      raised: "#f6f8fa",
      control: "#f6f8fa",
      border: "#d0d7de",
      accent: "#0969da",
      mutedForeground: "#57606a",
      ring: "#0969da",
    },
  },

  // Solarized Dark
  {
    id: "solarized-dark", name: "Solarized Dark", appearance: "dark",
    colors: {
      background: "#002b36",
      foreground: "#93a1a1",
      raised: "#073642",
      control: "#073642",
      border: "#586e75",
      accent: "#93a1a1",
      mutedForeground: "#93a1a1",
      ring: "#2aa198",
    },
  },

  // Solarized Light
  {
    id: "solarized-light", name: "Solarized Light", appearance: "light",
    colors: {
      background: "#fdf6e3",
      foreground: "#073642",
      raised: "#fdf6e3",
      control: "#eee8d5",
      border: "#93a1a1",
      accent: "#073642",
      mutedForeground: "#073642",
      ring: "#586e75",
    },
  },

  // Kanagawa Wave
  {
    id: "kanagawa-wave", name: "Kanagawa Wave", appearance: "dark",
    colors: {
      background: "#1f1f28",
      foreground: "#dcd7ba",
      raised: "#2a2a37",
      control: "#2a2a37",
      border: "#54546d",
      accent: "#7e9cd8",
      mutedForeground: "#c8c093",
      ring: "#7e9cd8",
    },
  },

  // Kanagawa Lotus
  {
    id: "kanagawa-lotus", name: "Kanagawa Lotus", appearance: "light",
    colors: {
      background: "#f2ecbc",
      foreground: "#545464",
      raised: "#e5ddb0",
      control: "#dcd5ac",
      border: "#c9cbd1",
      accent: "#43436c",
      mutedForeground: "#545464",
      ring: "#43436c",
    },
  },

  // Everforest Dark
  {
    id: "everforest-dark", name: "Everforest Dark", appearance: "dark",
    colors: {
      background: "#2d353b",
      foreground: "#d3c6aa",
      raised: "#343f44",
      control: "#3d484d",
      border: "#475258",
      accent: "#a7c080",
      mutedForeground: "#d3c6aa",
      ring: "#a7c080",
    },
  },

  // Everforest Light
  {
    id: "everforest-light", name: "Everforest Light", appearance: "light",
    colors: {
      background: "#fdf6e3",
      foreground: "#5c6a72",
      raised: "#f4f0d9",
      control: "#efebd4",
      border: "#e0dcc7",
      accent: "#5c6a72",
      mutedForeground: "#5c6a72",
      ring: "#5c6a72",
    },
  },

] as const;

export default function contribute(client: PluginClientContext) {
  const removers = themes.map((theme) => client.addTheme(theme));
  return () => {
    for (const remove of removers.reverse()) remove();
  };
}
