import type { PluginServerContext } from "@getpaseo/plugin/server";
import { homedir } from "node:os";
import path from "node:path";
import { externalHandler } from "./server/external";
import { listHandler } from "./server/list";
import { reopenHandler } from "./server/reopen";
import { StarStore } from "./server/stars";
import {
  listExternalSessions,
  listPastSessions,
  listStars,
  reopenPastSession,
  setStar,
  starAndArchive,
} from "./shared/rpc";
import { viewSettings } from "./shared/view";

export default function contribute(server: PluginServerContext) {
  const stars = new StarStore(
    path.join(process.env.PASEO_HOME ?? path.join(homedir(), ".paseo"), "plugin-data", "past-sessions", "stars.json"),
  );
  server.registerSettings(viewSettings);
  server.handle(listPastSessions, listHandler);
  server.handle(listExternalSessions, externalHandler);
  server.handle(reopenPastSession, (input) => reopenHandler(input, stars));
  server.handle(listStars, async () => ({ keys: await stars.keys() }));
  server.handle(setStar, async ({ key, starred }) => ({ keys: await stars.set(key, starred) }));
  server.handle(starAndArchive, async ({ agentId }, { paseo }) => {
    const keys = await stars.set(`paseo:${agentId}`, true);
    await paseo.agents.ref(agentId).archive();
    return { keys };
  });
  return () => {};
}
