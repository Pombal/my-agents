import { Platform } from "react-native";
import { overrides } from "./overrides";

// Paseo's plugin types need not include the DOM library.
interface StyleElement {
  textContent: string | null;
  setAttribute(name: string, value: string): void;
  remove(): void;
}
declare const document: {
  createElement(tag: "style"): StyleElement;
  head: { appendChild(element: StyleElement): void };
};

export function startStyleOverrides(): () => void {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};

  const style = document.createElement("style");
  style.setAttribute("data-plugin", "style-overrides");
  style.textContent = overrides;
  document.head.appendChild(style);
  return () => style.remove();
}
