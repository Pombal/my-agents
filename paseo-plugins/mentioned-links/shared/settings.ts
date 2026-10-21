import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

/** `showHeaderButton`: the links button in each workspace's header (on by default). */
export const headerSettings = defineSettings({
  id: "header",
  scope: "host",
  version: 1,
  schema: z.object({ showHeaderButton: z.boolean().default(true) }),
});
