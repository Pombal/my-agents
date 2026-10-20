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
 * What the providers in Paseo's config are, and which magic keywords OMP has enabled in each.
 * - `roots`: every configured provider id → the id at the end of its `extends` chain; built-ins
 *   and bases missing from the config map to themselves (`omp` → `omp`, `omp-nilo` → `omp`).
 * - `words`: OMP providers whose `omp config list` answered → the words enabled there. A provider
 *   absent here has unknown settings, so all words count.
 * - `failed`: OMP providers whose `omp config list` failed this time.
 */
export const ompFlagsRpc = defineRpc({
  name: "omp-flags.read",
  input: z.object({}),
  output: z.object({
    roots: z.record(z.string(), z.string()),
    words: z.record(z.string(), z.array(z.string())),
    failed: z.array(z.string()),
  }),
});
export type OmpFlags = z.output<typeof ompFlagsRpc.output>;
