import type { PluginClientContext } from "@getpaseo/plugin/client";
import { ompFlagsRpc } from "../shared/omp-flags";
import { isWeb } from "./web";

// Sanctioned web global for re-reading OMP's settings after they were edited elsewhere.
declare const window: {
  addEventListener(type: "focus", listener: () => void): void;
  removeEventListener(type: "focus", listener: () => void): void;
};

/**
 * Reports the words OMP has enabled per provider (providers absent = all words), now and
 * again whenever the window regains focus. Returns the cleanup.
 */
export function watchOmpFlags(client: PluginClientContext, onChange: (byProvider: Record<string, string[]>) => void): () => void {
  let disposed = false;
  let last = "";
  // A failed read keeps the last words: an older plugin server or a broken `omp` must not
  // take the colours away, and with nothing read yet every word stays on.
  const refresh = () => {
    client.rpc(ompFlagsRpc, {}).then((result) => {
      const byProvider = Object.fromEntries(Object.entries(result.providers).map(([provider, { words }]) => [provider, words]));
      const key = JSON.stringify(byProvider);
      if (disposed || key === last) return;
      last = key;
      onChange(byProvider);
    }, () => {});
  };
  refresh();
  if (isWeb) window.addEventListener("focus", refresh);
  return () => {
    disposed = true;
    if (isWeb) window.removeEventListener("focus", refresh);
  };
}
