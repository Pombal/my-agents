import { Platform } from "react-native";

// Paseo's plugin types leave out the DOM library; declare only what this module uses.
declare const document: {
  addEventListener(type: "keydown" | "pointerdown", listener: (event: { key?: string }) => void, capture: boolean): void;
  removeEventListener(type: "keydown" | "pointerdown", listener: (event: { key?: string }) => void, capture: boolean): void;
};

let keyboard = false;
const onKey = (event: { key?: string }) => {
  if (event.key === "Tab" || event.key?.startsWith("Arrow")) keyboard = true;
};
const onPointer = () => {
  keyboard = false;
};

/**
 * Tracks whether the last interaction was the keyboard, so focus rings follow `:focus-visible`
 * semantics: shown when tabbing, not after a click. Native apps have no focus rings to gate.
 */
export function startFocusModality(): () => void {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("pointerdown", onPointer, true);
  return () => {
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("pointerdown", onPointer, true);
  };
}

export function focusFromKeyboard(): boolean {
  return keyboard;
}
