import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

/**
 * Folders scanned besides the `.scratch` of Paseo's workspaces: a `.scratch` folder itself or a
 * folder that holds one (`~/workspace/drimgar-game`). `~` is the daemon user's home.
 */
export const folderSettings = defineSettings({
  id: "folders",
  scope: "host",
  version: 1,
  schema: z.object({ extraFolders: z.array(z.string()).default([]) }),
});
