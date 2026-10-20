import type { PluginClientContext } from "@getpaseo/plugin/client";
import { startKeywordShimmer } from "./client/web";

// Client-only: Paseo keeps rendering every message natively; this plugin only paints colors over
// the keywords in sent messages it finds on screen (web and desktop).
export default function contribute(_client: PluginClientContext) {
  return startKeywordShimmer();
}
