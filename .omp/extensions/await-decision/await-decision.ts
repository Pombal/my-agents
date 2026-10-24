import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

/**
 * Parks the session in Paseo's "needs input" state by opening a free-text
 * prompt. Paseo maps `ctx.ui.input` to a pending question request, which is
 * the only thing that drives its needs_input status. A typed chat message
 * cancels the prompt and reaches the agent as usual, so the card is optional.
 */
export default function awaitDecision(pi: ExtensionAPI): void {
	const z = pi.zod;
	pi.registerTool({
		name: "await_decision",
		label: "Await decision",
		description:
			"Call once, as the last action of a turn, when the next step is Stefan's decision. Marks the session 'needs input' in Paseo.",
		parameters: z.object({
			summary: z.string().describe("One line: what is being decided"),
		}),
		// Direct tool, not an xd:// device: one call, no schema read first.
		loadMode: "essential",
		// Only opens a prompt; approval modes never gate it.
		approval: "read",
		async execute(_id, params, signal, _onUpdate, ctx) {
			if (!ctx.hasUI) {
				return { content: [{ type: "text", text: "No UI; decision pending in chat." }] };
			}
			// An interrupt must not wait on the prompt, or Paseo's cancel times out.
			const aborted = Promise.withResolvers<undefined>();
			if (signal?.aborted) aborted.resolve(undefined);
			signal?.addEventListener("abort", () => aborted.resolve(undefined), { once: true });
			const answer = await Promise.race([
				ctx.ui.input(params.summary, "Reply here or in the message box"),
				aborted.promise,
			]);
			// No answer: Stefan dismissed the prompt, or wrote in chat (that message arrives next).
			const text = answer ? `Stefan: ${answer}` : "No answer in the prompt. If Stefan wrote in chat, his message follows.";
			return { content: [{ type: "text", text }] };
		},
	});
}
