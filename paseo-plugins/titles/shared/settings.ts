import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

// When titles change without Stefan asking. Manual Retitle always works.
export const settings = defineSettings({
  id: "automatic",
  scope: "host",
  version: 1,
  schema: z.object({ automatic: z.enum(["off", "first", "every"]).default("first") }),
});
export type Automatic = z.output<typeof settings.schema>["automatic"];
