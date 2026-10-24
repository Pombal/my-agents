import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

/** `showHeaderButton`: the links button in each workspace's header (on by default). */
export const headerSettings = defineSettings({
  id: "header",
  scope: "host",
  version: 1,
  schema: z.object({ showHeaderButton: z.boolean().default(true) }),
});

/** Empty origin leaves webshare paths as local files. Initializes the cache after each plugin load. */
export const webshareSettings = defineSettings({
  id: "webshare",
  scope: "host",
  version: 1,
  schema: z.object({ origin: z.union([z.literal(""), z.string().url()]).default("") }),
});
