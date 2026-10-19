import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const DensitySchema = z.enum(["comfortable", "compact"]);
export type Density = z.infer<typeof DensitySchema>;

/** List density, saved on the host so it survives app reloads and other windows see it. */
export const viewSettings = defineSettings({
  id: "view",
  scope: "host",
  version: 1,
  schema: z.object({ density: DensitySchema.default("comfortable") }),
});
