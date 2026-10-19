import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

const result = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("renamed"), title: z.string() }),
  z.object({ outcome: z.literal("kept"), title: z.string() }),
  z.object({ outcome: z.literal("unclear") }), // No subject yet to name; title untouched.
  z.object({ outcome: z.literal("failed"), message: z.string() }),
]);
export type RetitleResult = z.infer<typeof result>;

export const retitle = defineRpc({ name: "retitle", input: z.object({ agentId: z.string().min(1) }), output: result });
