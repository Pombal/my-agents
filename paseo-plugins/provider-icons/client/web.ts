import { Platform } from "react-native";
import type { Preferences } from "../shared/preferences";
import { MAX_IMAGE_BYTES, resolveMapping, validateImage } from "../shared/images";
import { resolveHost, resolveProvider, type IconScope } from "../shared/identity";

// Web-only DOM interop, deliberately outside the shared/native modules.
declare const location: { pathname: string };
interface WebNode {
  style: { display: string };
  textContent: string | null;
  type: string;
  accept: string;
  files?: ArrayLike<{ size: number; name: string }>;
  oncancel: (() => void) | null;
  onchange: (() => void) | null;
  appendChild(node: WebNode): void;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  removeAttribute(name: string): void;
  remove(): void;
  click(): void;
}
interface Fiber { memoizedProps: IconScope | null; type: unknown; return: Fiber | null }
declare const document: {
  head: WebNode; body: WebNode;
  createElement(tag: string): WebNode;
  querySelectorAll(selector: string): Iterable<WebNode>;
};
declare const FileReader: new () => {
  result: unknown;
  onerror: (() => void) | null;
  onload: (() => void) | null;
  readAsDataURL(file: { size: number; name: string }): void;
};
declare const Image: new () => {
  naturalWidth: number; naturalHeight: number; src: string;
  onerror: (() => void) | null; onload: (() => void) | null;
};
declare const MutationObserver: new (callback: () => void) => {
  observe(node: WebNode, options: { subtree: boolean; childList: boolean; characterData: boolean; attributes: boolean; attributeFilter: string[] }): void;
  disconnect(): void;
};
declare const requestAnimationFrame: (callback: () => void) => number;
declare const cancelAnimationFrame: (id: number) => void;

export async function pickImage(): Promise<{ image: string; name: string } | null> {
  if (Platform.OS !== "web" || typeof document === "undefined") throw new Error("Choose images from the web or desktop app.");
  const { promise, resolve, reject } = Promise.withResolvers<{ image: string; name: string } | null>();
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".svg,.png,.webp,.jpg,.jpeg,image/svg+xml,image/png,image/webp,image/jpeg";
    input.setAttribute("aria-label", "Choose provider icon image");
    input.style.display = "none";
    document.body.appendChild(input);
    input.oncancel = () => { input.remove(); resolve(null); };
    input.onchange = () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) { resolve(null); return; }
      if (file.size > MAX_IMAGE_BYTES) { reject(new Error("Image exceeds 128 KiB. Use a small icon.")); return; }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read image."));
      reader.onload = () => {
        const image = String(reader.result);
        const error = validateImage(image);
        if (error) { reject(new Error(error)); return; }
        const preview = new Image();
        preview.onerror = () => reject(new Error("The browser could not decode this image."));
        preview.onload = () => {
          if (!preview.naturalWidth || !preview.naturalHeight || preview.naturalWidth > 4096 || preview.naturalHeight > 4096) {
            reject(new Error("Use an image no larger than 4096 × 4096 pixels."));
          } else resolve({ image, name: file.name });
        };
        preview.src = image;
      };
      reader.readAsDataURL(file);
    };
    input.click();
  return promise;
}

export function startIcons() {
  const agents = new Map<string, string>();
  const labels = new Map<string, string>();
  let values: Preferences = { mappings: [] };
  let frame = 0;
  let disposed = false;
  let hostId: string | undefined;
  if (Platform.OS !== "web" || typeof document === "undefined") {
    return { update(_values: Preferences, _host?: string) {}, agent(_id: string, _provider: string) {}, provider(_id: string, _label: string) {}, dispose() {} };
  }
  const style = document.createElement("style");
  style.setAttribute("data-plugin", "provider-icons");
  document.head.appendChild(style);
  function scan() {
    frame = 0;
    if (disposed) return;
    for (const svg of document.querySelectorAll("svg")) {
      const cssClass = svg.getAttribute("class") ?? "";
      // Lucide actions inside provider rows must retain their own glyphs.
      const width = Number(svg.getAttribute("width"));
      const height = Number(svg.getAttribute("height"));
      const eligible = width > 0 && width <= 64 && width === height &&
        (!/\blucide\b/.test(cssClass) || /\blucide-(?:bot|package-plus)\b/.test(cssClass));
      let provider: string | undefined;
      if (eligible && values.mappings.length && hostId) {
        const key = Object.keys(svg).find((name) => name.startsWith("__reactFiber$"));
        // React attaches its live ownership chain to each host SVG; this is in-process metadata.
        const owned = svg as unknown as Record<string, Fiber | undefined>;
        let fiber = key ? owned[key] : null;
        const scopes: IconScope[] = [];
        for (let depth = 0; fiber && depth < 70; depth++, fiber = fiber.return) {
          const props = fiber.memoizedProps;
          if (!props || typeof fiber.type === "string") continue;
          scopes.push(props);
          // Continue past the glyph wrapper only until its host owner is known.
          if (props.serverId) break;
        }
        if (resolveHost(scopes, location.pathname) === hostId) provider = resolveProvider(scopes, agents, labels);
      }
      const mapping = resolveMapping(values.mappings, provider ?? "");
      if (mapping) {
        const token = encodeURIComponent(mapping.provider);
        if (svg.getAttribute("data-provider-icons") !== token) svg.setAttribute("data-provider-icons", token);
        svg.setAttribute("data-provider-icons-host", encodeURIComponent(hostId ?? ""));
      } else if (svg.getAttribute("data-provider-icons-host") === encodeURIComponent(hostId ?? "")) {
        svg.removeAttribute("data-provider-icons");
        svg.removeAttribute("data-provider-icons-host");
      }
    }
  }
  function schedule() {
    if (!disposed && !frame) frame = requestAnimationFrame(scan);
  }
  const observer = new MutationObserver(() => { if (values.mappings.length) schedule(); });
  observer.observe(document.body, { subtree: true, childList: true, characterData: false, attributes: true, attributeFilter: ["aria-label", "data-testid", "width", "height", "class"] });
  return {
    update(next: Preferences, host?: string) {
      values = next;
      hostId = host ?? next.hostId ?? hostId;
      style.textContent = next.mappings.map((mapping) => {
        const token = encodeURIComponent(mapping.provider);
        const selector = `svg[data-provider-icons-host="${encodeURIComponent(hostId ?? "")}"][data-provider-icons="${token}"]`;
        return `${selector} { background-image:url("${mapping.image}") !important; background-size:contain !important; background-position:center !important; background-repeat:no-repeat !important; }\n${selector} > * { visibility:hidden !important; }`;
      }).join("\n");
      schedule();
    },
    agent(id: string, provider: string) { agents.set(id, provider); schedule(); },
    provider(id: string, label: string) {
      labels.set(label, labels.has(label) && labels.get(label) !== id ? "" : id);
      schedule();
    },
    dispose() {
      disposed = true;
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      style.remove();
      for (const svg of document.querySelectorAll(`svg[data-provider-icons-host="${encodeURIComponent(hostId ?? "")}"]`)) {
        svg.removeAttribute("data-provider-icons");
        svg.removeAttribute("data-provider-icons-host");
      }
    },
  };
}
