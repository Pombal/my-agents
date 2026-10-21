import { Platform } from "react-native";

// Paseo's plugin types leave out the DOM library; declare only what this module uses.
declare const localStorage: {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

const SHOW_FILES_KEY = "mentioned-links:show-files";

/** Whether this browser last chose to show files. Native apps keep the choice in memory only. */
export function readShowFiles(): boolean {
  if (Platform.OS !== "web") return false;
  try {
    return localStorage.getItem(SHOW_FILES_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeShowFiles(show: boolean): void {
  if (Platform.OS !== "web") return;
  try {
    localStorage.setItem(SHOW_FILES_KEY, show ? "1" : "0");
  } catch {
    // Private browsing can deny storage.
  }
}

/** Minimal shape of a DOM element, enough to hide it. */
interface DomNode {
  parentElement: { style: { display: string } } | null;
}

/** Web only: hides the element that contains `node` (the 16 px icon slot Paseo draws for every plugin pill). */
export function hideParentSlot(node: unknown): void {
  if (Platform.OS !== "web" || !node) return;
  const slot = (node as DomNode).parentElement;
  if (slot) slot.style.display = "none";
}
