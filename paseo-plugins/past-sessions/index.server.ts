import type { PluginServerContext } from "@getpaseo/plugin/server";
import { homedir } from "node:os";
import path from "node:path";
import { externalHandler } from "./server/external";
import { listHandler } from "./server/list";
import { markKeys, openMarks } from "./server/marks";
import { reopenHandler } from "./server/reopen";
import {
  listExternalSessions,
  listMarks,
  listPastSessions,
  reopenPastSession,
  setMark,
  starAndArchive,
} from "./shared/rpc";
import { viewSettings } from "./shared/view";

export default function contribute(server: PluginServerContext) {
  const marks = openMarks(
    path.join(process.env.PASEO_HOME ?? path.join(homedir(), ".paseo"), "plugin-data", "past-sessions"),
  );
  server.registerSettings(viewSettings);
  server.handle(listPastSessions, listHandler);
  server.handle(listExternalSessions, externalHandler);
  server.handle(reopenPastSession, (input) => reopenHandler(input, marks));
  server.handle(listMarks, () => markKeys(marks));
  server.handle(setMark, async ({ key, mark, on }) => {
    await marks[mark].set(key, on);
    return markKeys(marks);
  });
  server.handle(starAndArchive, async ({ agentId }, { paseo }) => {
    await marks.starred.set(`paseo:${agentId}`, true);
    await paseo.agents.ref(agentId).archive();
    return markKeys(marks);
  });
  return () => {};
}
