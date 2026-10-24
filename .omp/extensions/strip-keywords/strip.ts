import type { AgentMessage } from "@oh-my-pi/pi-agent-core";

/**
 * Pure keyword stripping, kept free of OMP runtime imports so it can be
 * exercised directly.
 *
 * A keyword is removed only where it stands as its own whitespace-delimited
 * token. Whitespace is repaired locally around each removal: indentation and
 * line structure survive, a line left holding nothing but the keyword is
 * dropped, and nothing outside a matching message changes. Same input, same
 * output, so provider prompt caches stay stable.
 */

/** Builds the token matcher, or `null` when there is nothing to strip. */
export function compileKeywords(keywords: readonly string[]): RegExp | null {
	// Longest first, so a keyword never loses to a shorter one sharing its prefix.
	const unique = [...new Set(keywords.filter(keyword => keyword.trim().length > 0))].sort(
		(a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0),
	);
	if (unique.length === 0) return null;
	const alternation = unique.map(keyword => keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
	return new RegExp(`(?<!\\S)(?:${alternation})(?!\\S)`, "g");
}

const LEADING_HSPACE = /^[^\S\r\n]+/;
const TRAILING_HSPACE = /[^\S\r\n]+$/;
const BLANK = /^\s*$/;

function stripLine(line: string, matcher: RegExp): string | null {
	matcher.lastIndex = 0;
	if (!matcher.test(line)) return null;
	matcher.lastIndex = 0;
	const pieces = line.split(matcher);
	let out = pieces[0]!;
	for (let i = 1; i < pieces.length; i++) {
		const left = out.replace(TRAILING_HSPACE, "");
		const right = pieces[i]!.replace(LEADING_HSPACE, "");
		if (left === "") out = out + right; // keyword led the line: keep its indentation
		else if (right === "") out = left; // keyword ended the line: drop trailing space
		else out = `${left} ${right}`;
	}
	return out;
}

/** Returns `text` itself when no keyword token occurs in it. */
export function stripKeywordsFromText(text: string, matcher: RegExp | null): string {
	if (!matcher) return text;
	matcher.lastIndex = 0;
	if (!matcher.test(text)) return text;

	const out: string[] = [];
	let droppedSinceLastKept = false;
	for (const rawLine of text.split("\n")) {
		const cr = rawLine.endsWith("\r") ? "\r" : "";
		const line = cr ? rawLine.slice(0, -1) : rawLine;
		const stripped = stripLine(line, matcher);
		if (stripped === null) {
			// Dropping a keyword-only line between two blank lines would leave a
			// double gap; fold it back to the original single paragraph break.
			if (droppedSinceLastKept && BLANK.test(line) && out.length > 0 && BLANK.test(out[out.length - 1]!)) {
				droppedSinceLastKept = false;
				continue;
			}
			out.push(rawLine);
			droppedSinceLastKept = false;
			continue;
		}
		if (BLANK.test(stripped)) {
			droppedSinceLastKept = true;
			continue;
		}
		out.push(stripped + cr);
		droppedSinceLastKept = false;
	}
	return out
		.join("\n")
		.replace(/^(?:[^\S\n]*\n)+/, "")
		.trimEnd();
}

/**
 * Strips keywords from one user message. Returns the same object when nothing
 * matched. Emptied text stays as `""` (string or text block): every OMP
 * provider already skips blank user text at the wire, and Anthropic repairs
 * the resulting role adjacency itself.
 */
export function stripKeywordsFromMessage(message: AgentMessage, matcher: RegExp | null): AgentMessage {
	if (!matcher || message.role !== "user") return message;
	const { content } = message;
	if (typeof content === "string") {
		const next = stripKeywordsFromText(content, matcher);
		return next === content ? message : { ...message, content: next };
	}
	let changed = false;
	const blocks = content.map(block => {
		if (block.type !== "text") return block;
		const text = stripKeywordsFromText(block.text, matcher);
		if (text === block.text) return block;
		changed = true;
		return { ...block, text };
	});
	return changed ? { ...message, content: blocks } : message;
}

/** Returns `undefined` when no message changed, so the context chain stays untouched. */
export function stripKeywordsFromMessages(
	messages: readonly AgentMessage[],
	matcher: RegExp | null,
): AgentMessage[] | undefined {
	if (!matcher) return undefined;
	let changed = false;
	const next = messages.map(message => {
		const stripped = stripKeywordsFromMessage(message, matcher);
		if (stripped !== message) changed = true;
		return stripped;
	});
	return changed ? next : undefined;
}
