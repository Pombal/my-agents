import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

/**
 * `extraFolders`: folders scanned besides the `.scratch` of Paseo's workspaces: a `.scratch`
 * folder itself or a folder that holds one (`~/workspace/acme-app`). `~` is the daemon user's
 * home. `showHeaderButton`: the effort pill in each workspace's header.
 * `excludedFolders`: folders whose descendants are skipped unless explicitly listed as extras.
 */
export const folderSettings = defineSettings({
  id: "folders",
  scope: "host",
  version: 1,
  schema: z.object({ extraFolders: z.array(z.string()).default([]), showHeaderButton: z.boolean().default(true), excludedFolders: z.array(z.string()).default([]) }),
});
