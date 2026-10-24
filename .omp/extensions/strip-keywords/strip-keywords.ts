import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { compileKeywords, stripKeywordsFromMessages } from "./strip";

/**
 * Hides magic keywords from the model while keeping them in the session file.
 *
 * The `context` hook rewrites only the copy of the conversation sent to the
 * provider; persisted history keeps the original text, so external watchers of
 * the session `.jsonl` still see every keyword. Stripping at `input` would lose
 * them from the transcript as well.
 *
 * Config: `$PI_CODING_AGENT_DIR/strip-keywords.json` (`{ "keywords": [...] }`),
 * re-read whenever its mtime or size changes. Missing or invalid → no-op.
 */

interface ConfigState {
	/** `path:mtimeMs:size` of the file the matcher came from; `null` when absent. */
	stamp: string | null;
	matcher: RegExp | null;
}

function parseKeywords(raw: string): string[] {
	const parsed: unknown = JSON.parse(raw);
	if (!parsed || typeof parsed !== "object" || !("keywords" in parsed)) {
		throw new Error('expected an object with a "keywords" array');
	}
	const { keywords } = parsed;
	if (!Array.isArray(keywords) || !keywords.every(keyword => typeof keyword === "string")) {
		throw new Error('"keywords" must be an array of strings');
	}
	return keywords;
}

export default function stripKeywordsExtension(pi: ExtensionAPI): void {
	let state: ConfigState = { stamp: null, matcher: null };

	function currentMatcher(ctx: ExtensionContext): RegExp | null {
		// Read per request: named profiles point PI_CODING_AGENT_DIR at their own agent dir.
		const agentDir = process.env.PI_CODING_AGENT_DIR?.trim() || join(homedir(), ".omp", "agent");
		const path = join(agentDir, "strip-keywords.json");
		let stamp: string | null;
		try {
			const stat = statSync(path);
			stamp = `${path}:${stat.mtimeMs}:${stat.size}`;
		} catch {
			stamp = null;
		}
		if (stamp === state.stamp) return state.matcher;

		let matcher: RegExp | null = null;
		if (stamp !== null) {
			try {
				matcher = compileKeywords(parseKeywords(readFileSync(path, "utf8")));
			} catch (error) {
				// Reported once per file version: the stamp is cached below either way.
				const message = `strip-keywords: ignoring ${path}: ${error instanceof Error ? error.message : String(error)}`;
				pi.logger.warn(message);
				if (ctx.hasUI) ctx.ui.notify(message, "warning");
			}
		}
		state = { stamp, matcher };
		return matcher;
	}

	pi.on("context", (event, ctx) => {
		const messages = stripKeywordsFromMessages(event.messages, currentMatcher(ctx));
		return messages ? { messages } : undefined;
	});
}
