import type { PluginServerContext } from "@getpaseo/plugin/server";
import { homedir } from "node:os";
import { createLinksService } from "./server/service";
import { linksForAgent, linksForWorkspace } from "./shared/links";
import { headerSettings } from "./shared/settings";

export default function contribute(server: PluginServerContext) {
  const { forAgent, forWorkspace } = createLinksService(homedir());
  server.registerSettings(headerSettings);
  server.handle(linksForAgent, (input, { paseo }) => forAgent(input, paseo));
  server.handle(linksForWorkspace, (input, { paseo }) => forWorkspace(input, paseo));
  return () => {};
}
