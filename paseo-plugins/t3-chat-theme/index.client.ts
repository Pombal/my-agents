import type { PluginClientContext } from "@getpaseo/plugin/client";

// T3 Code's T3_CHAT_THEME, converted from OKLCH to sRGB hex for Paseo.
// Palette source and the few role adaptations are documented in OVERVIEW.md.
export default function contribute(client: PluginClientContext) {
  const removeDark = client.addTheme({
    id: "dark",
    name: "T3 Chat Dark",
    appearance: "dark",
    colors: {
      background: "#1f1a24",
      foreground: "#f9f8fb",
      raised: "#2c2631",
      control: "#362d3d",
      border: "#27242c",
      accent: "#fbd0e8",
      mutedForeground: "#e7d0dd",
      ring: "#d4c7e1",
    },
  });
  const removeLight = client.addTheme({
    id: "light",
    name: "T3 Chat Light",
    appearance: "light",
    colors: {
      background: "#fdf7fd",
      foreground: "#501854",
      raised: "#fdfafd",
      control: "#f2e1f4",
      border: "#eee1ed",
      accent: "#c12269",
      mutedForeground: "#ac1668",
      ring: "#f7def2",
    },
  });
  return () => {
    removeLight();
    removeDark();
  };
}
