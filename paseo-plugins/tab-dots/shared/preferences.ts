import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const SHOW_MODES = ["unread", "unread-running", "all"] as const;
export const SIZES = ["regular", "small"] as const;
export const ALIGNS = ["edge", "steady", "left"] as const;

export const preferences = defineSettings({
  id: "dots",
  scope: "host",
  version: 1,
  schema: z.object({
    enabled: z.boolean().default(true),
    /** unread: tabs waiting on you · unread-running: plus running tabs · all: one dot per tab. */
    show: z.enum(SHOW_MODES).default("unread"),
    /** regular: 5 px dots, up to 5 · small: 4 px dots, up to 8. */
    size: z.enum(SIZES).default("regular"),
    /** Hide the row's time while it shows dots. */
    replaceTime: z.boolean().default(true),
    /** edge = where the time was, shifts left on row hover (menu) · steady = right, never moves · left = right after the title. */
    align: z.enum(ALIGNS).default("edge"),
    /** Running dots pulse; off keeps them solid. Reduced motion stops the pulse either way. */
    animate: z.boolean().default(true),
  }),
});
export type Preferences = z.output<typeof preferences.schema>;
export type ShowMode = Preferences["show"];
export type DotSize = Preferences["size"];
export type DotAlign = Preferences["align"];
export const DEFAULTS: Preferences = preferences.schema.parse({});
