import type { PluginClientContext } from "@getpaseo/plugin/client";
import { startStyleOverrides } from "./client/web";

export default function contribute(_client: PluginClientContext) {
  return startStyleOverrides();
}
