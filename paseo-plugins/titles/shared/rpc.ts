import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const retitle = defineRpc({
  name: "retitle",
  input: z.object({ agentId: z.string().min(1) }),
  output: z.object({ message: z.string(), latencyMs: z.number() }),
});
export const noticeSchema = z.object({ message: z.string(), latencyMs: z.number() });
