import type { PluginServerContext } from "@getpaseo/plugin/server";
import { externalHandler } from "./server/external";
import { listHandler } from "./server/list";
import { reopenHandler } from "./server/reopen";
import { listExternalSessions, listPastSessions, reopenPastSession } from "./shared/rpc";
import { viewSettings } from "./shared/view";

export default function contribute(server: PluginServerContext) {
  server.registerSettings(viewSettings);
  server.handle(listPastSessions, listHandler);
  server.handle(listExternalSessions, externalHandler);
  server.handle(reopenPastSession, reopenHandler);
  return () => {};
}
