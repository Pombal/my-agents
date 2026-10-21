import type { PluginClientContext } from "@getpaseo/plugin/client";
import { startPills } from "./client/pills";

export default function contribute(client: PluginClientContext) {
  return startPills(client);
}
