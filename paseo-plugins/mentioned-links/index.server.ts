import type { PluginServerContext } from "@getpaseo/plugin/server";
import { homedir } from "node:os";
import { createLinksService, type LinksService } from "./server/service";
import { linksForAgent, linksForWorkspace } from "./shared/links";
import { headerSettings, webshareSettings } from "./shared/settings";

export default function contribute(server: PluginServerContext) {
  server.registerSettings(headerSettings);
  const settings = server.registerSettings(webshareSettings);
  let service: Promise<LinksService> | undefined;
  const getService = () => service ??= settings.read().then((webshare) => {
    if (webshare.status !== "ready") throw new Error(webshare.error);
    return createLinksService(homedir(), webshare.values.origin);
  });
  server.handle(linksForAgent, async (input, { paseo }) => (await getService()).forAgent(input, paseo));
  server.handle(linksForWorkspace, async (input, { paseo }) => (await getService()).forWorkspace(input, paseo));
  return () => {};
}
