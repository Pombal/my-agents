import type { PluginServerContext } from "@getpaseo/plugin/server";
import { homedir } from "node:os";
import { createLinksService } from "./server/service";
import { linksForAgent } from "./shared/links";

export default function contribute(server: PluginServerContext) {
  const forAgent = createLinksService(homedir());
  server.handle(linksForAgent, (input, { paseo }) => forAgent(input, paseo));
  return () => {};
}
