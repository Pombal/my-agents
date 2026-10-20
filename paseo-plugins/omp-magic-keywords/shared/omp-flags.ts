import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

// OMP's setting ids for its magic keywords, mapped to the words they switch. The ids are
// not always the words (`magicKeywords.workflow` switches `workflowz`), and `omp config`
// only reports the ids, so this table stays in the plugin.
export const OMP_KEYWORD_WORDS: Record<string, string> = {
  ultrathink: "ultrathink",
  orchestrate: "orchestrate",
  workflow: "workflowz",
  jevify: "jevify",
};

/**
 * The magic keywords OMP has enabled, per Paseo provider that launches OMP.
 * A provider missing from `providers` has unknown settings, so all words count.
 */
export const ompFlagsRpc = defineRpc({
  name: "omp-flags.read",
  input: z.object({}),
  output: z.object({ providers: z.record(z.string(), z.object({ words: z.array(z.string()) })) }),
});
export type OmpFlags = z.output<typeof ompFlagsRpc.output>;
