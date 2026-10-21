import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

/**
 * `extraFolders`: folders scanned besides the `.scratch` of Paseo's workspaces: a `.scratch`
 * folder itself or a folder that holds one (`~/workspace/drimgar-game`). `~` is the daemon user's
 * home. `showHeaderButton`: the effort pill in each workspace's header.
 */
export const folderSettings = defineSettings({
  id: "folders",
  scope: "host",
  version: 1,
  schema: z.object({ extraFolders: z.array(z.string()).default([]), showHeaderButton: z.boolean().default(true) }),
});
