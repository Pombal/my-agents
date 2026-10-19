import { Platform } from "react-native";
import type { Preferences } from "../shared/preferences";

// Sanctioned web-only globals: no DOM library in the rest of the plugin.
interface StyleElement {
  textContent: string | null;
  setAttribute(name: string, value: string): void;
  remove(): void;
}
declare const document: {
  head: { appendChild(element: StyleElement): void };
  createElement(tag: "style"): StyleElement;
};

export function startDecluttering() {
  if (Platform.OS !== "web" || typeof document === "undefined") {
    return { update(_values: Preferences) {}, dispose() {} };
  }
  const style = document.createElement("style");
  style.setAttribute("data-plugin", "composer-declutter");
  document.head.appendChild(style);
  return {
    update(values: Preferences) {
      const selectors: string[] = [];
      if (values.hideThinking) selectors.push('[data-testid="agent-thinking-selector"]');
      if (values.hideMode) selectors.push('[data-testid="mode-control"]');
      if (values.hideFastMode) selectors.push('[data-testid="agent-feature-fast_mode"]');
      if (values.hideOtherFeatures) {
        selectors.push('[data-testid^="agent-feature-"]:not([data-testid="agent-feature-fast_mode"])');
      }
      // Match ONLY idle start buttons. Never match recording, processing, cancel,
      // stop, retry, insert, mute/unmute or disconnect controls, including overlays.
      if (values.hideDictation) selectors.push('[data-testid="message-input-root"] [aria-label="Start dictation"]');
      if (values.hideVoice) selectors.push('[data-testid="message-input-root"] [aria-label="Enable Voice mode"]');
      style.textContent = selectors.length ? `${selectors.join(",\n")} { display: none !important; }` : "";
    },
    dispose() { style.remove(); },
  };
}
