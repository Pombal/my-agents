import type { PluginServerContext } from "@getpaseo/plugin/server";
import { createOmpFlagsHandler } from "./server/omp-flags";
import { ompFlagsRpc } from "./shared/omp-flags";
import { preferences } from "./shared/preferences";

export default function contribute(server: PluginServerContext) {
  server.registerSettings(preferences);
  server.handle(ompFlagsRpc, createOmpFlagsHandler());
  return () => {};
}
