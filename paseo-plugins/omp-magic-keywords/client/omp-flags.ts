import type { PluginClientContext } from "@getpaseo/plugin/client";
import { ompFlagsRpc, type OmpFlags } from "../shared/omp-flags";

// Sanctioned web global for re-reading OMP's settings after they were edited elsewhere.
declare const window: {
  addEventListener(type: "focus", listener: () => void): void;
  removeEventListener(type: "focus", listener: () => void): void;
};

/**
 * Reports the provider roots and OMP's enabled words, now and again whenever the window
 * regains focus, skipping answers identical to the last. Returns the cleanup.
 */
export function watchOmpFlags(client: PluginClientContext, onChange: (flags: OmpFlags) => void): () => void {
  let disposed = false;
  let last = "";
  // A failed RPC reports nothing, so an older plugin server keeps the last flags (or, before any
  // answer, the engine's fallback). A provider whose `omp` failed arrives in `failed`, and the
  // engine keeps that provider's previous words.
  const refresh = () => {
    client.rpc(ompFlagsRpc, {}).then((flags) => {
      const key = JSON.stringify(flags);
      if (disposed || key === last) return;
      last = key;
      onChange(flags);
    }, () => {});
  };
  refresh();
  window.addEventListener("focus", refresh);
  return () => {
    disposed = true;
    window.removeEventListener("focus", refresh);
  };
}
