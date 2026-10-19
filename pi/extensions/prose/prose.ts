/**
 * /prose for Pi — fork the conversation into a new session that keeps only
 * what was said: your messages and the agent's replies, verbatim. Provider
 * bookkeeping and reasoning are dropped, skill injections shrink to a stub,
 * and every tool call collapses to one `[ran tool target]` line.
 *
 * Port of the omp extension (.omp/extensions/prose/prose.ts), bare fork only.
 * What differs from omp, and why:
 *   - no `N` / `^N` / `?` in-place trims: they need omp's /clear boundary and
 *     session flush, which Pi does not have.
 *   - no `-sub`: background subagent deliveries are an omp entry type.
 *   - no job-kill warning: Pi exposes no background-job snapshot.
 *   - the archive is a plain file beside the fork's session file,
 *     `<fork>.prose.md`, instead of an omp `artifact://`. The prose-note names
 *     its path once; each trace carries only `recover: Lstart-end`.
 *   - Pi skills arrive as a `<skill name=… location=…>` user message, not a
 *     custom entry; `±skills` trims that block.
 *   - `context_edit` entries are applied first, so the fork distills what the
 *     model actually saw (Pi uses them to drop failed replies on retry).
 *
 * Usage:
 *   /prose                    fork the region Pi still emits (after the latest
 *                             compaction) into a new session
 *   /prose story              the whole exchange as ONE user message with
 *                             [@user]/[@assistant]/[@system] speaker markers
 *   /prose +tools             every tool call and result kept as native turns
 *   /prose -tools             no tool traces at all
 *   /prose +tools=read,edit   those tools native, every other tool traced
 *   /prose -tools=bash        those tools erased, every other tool traced
 *   /prose -skills            skill invocations shrink to [invoked skill: name] + prompt
 *   /prose +skills            keep injected skill bodies verbatim
 *   /prose +think             keep readable reasoning in [thinking]…[/thinking]
 *   /prose +compacted         also distill history a compaction sealed
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import type { AssistantMessage, ImageContent, Message, TextContent, ToolCall, ToolResultMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, SessionEntry } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";

/** How much of a tool call survives: erased, one bracketed line, or native replay. */
export type ToolLevel = "none" | "trace" | "full";
/** `default` covers every tool the user did not name; `byName` overrides it per tool. */
export type ToolKeep = { default: ToolLevel; byName: Map<string, ToolLevel> };
export type Keep = {
	thinking: boolean;
	tools: ToolKeep;
	skills: "full" | "brief" | "bare";
	story: boolean;
};

export interface ArchiveSpan {
	startLine: number;
	endLine: number;
}

export interface ProseArchive {
	content: string;
	spansByCallId: Map<string, ArchiveSpan>;
	itemCount: number;
	/** Prior-generation `L<start>-<end>` keys → where their lines now sit in this archive. */
	rebasedSpans: Map<string, ArchiveSpan>;
}

type CustomMessageEntry = Extract<SessionEntry, { type: "custom_message" }>;
type CustomContent = CustomMessageEntry["content"];
type Part = TextContent | ImageContent;
type AssistantPart = TextContent | ToolCall;
type AssistantTextKind = "prose" | "trimmed" | "thinking";
type AssistantSegment = { part: AssistantPart; textKind?: AssistantTextKind };

export type ProseItem =
	| { kind: "message"; message: Message }
	| { kind: "custom"; customType: string; content: CustomContent; display: boolean; details?: unknown };

const levelFor = (keep: ToolKeep, name: string): ToolLevel => keep.byName.get(name) ?? keep.default;
const levelsUsed = (keep: ToolKeep): Set<ToolLevel> => new Set([keep.default, ...keep.byName.values()]);

const asText = (text: string): TextContent => ({ type: "text", text });

const pushText = (parts: (Part | AssistantPart)[], text: string) => {
	if (text.trim().length > 0) parts.push(asText(text));
};

const edgeNewlines = (left: string, right: string): number => {
	let count = 0;
	for (let i = left.length - 1; i >= 0 && left.charCodeAt(i) === 10; i--) count++;
	for (let i = 0; i < right.length && right.charCodeAt(i) === 10; i++) count++;
	return count;
};

/**
 * Materialize classified assistant text without changing prose bytes. Adjacent
 * bracketed traces stay one compact group. A thinking block, and every
 * transition between that editorial group and verbatim prose, gets one empty
 * line. A blank line ends a markdown blockquote, which is why thinking lines
 * carry their own `> ` instead of continuing the trace quote.
 */
function appendAssistantSegments(
	target: AssistantPart[],
	segments: AssistantSegment[],
	previousTextKind?: AssistantTextKind,
): AssistantTextKind | undefined {
	for (const segment of segments) {
		const previous = target.at(-1);
		if (
			previous?.type === "text" &&
			segment.part.type === "text" &&
			previousTextKind &&
			segment.textKind &&
			(previousTextKind !== "prose" || segment.textKind !== "prose")
		) {
			const separated = previousTextKind === "thinking" || segment.textKind === "thinking" || previousTextKind !== segment.textKind;
			const requiredNewlines = separated ? 2 : previousTextKind === "trimmed" ? 1 : 0;
			const separator = "\n".repeat(Math.max(0, requiredNewlines - edgeNewlines(previous.text, segment.part.text)));
			previous.text += separator + segment.part.text;
		} else {
			target.push(segment.part);
		}
		previousTextKind = segment.part.type === "text" ? segment.textKind : undefined;
	}
	return previousTextKind;
}

const targetText = (value: unknown): string => (value === undefined || value === null ? "" : String(value));

/** Delegations, searches, and fetches exist only in their arguments; a path or command still points at something real. */
const SPEECH_TOOLS: Record<string, true> = { web_search: true, fetch_content: true, subagent: true };
const TARGET_CAP = 120;
const SPEECH_CAP = 240;

/**
 * Label inside each trace bracket: `[ran read foo.ts]`. Past tense marks the
 * line as a record of something that already happened, never an instruction.
 */
const TRACE_PREFIX = "ran ";

/** Prefix every line so a blank line cannot end the blockquote early. */
function quoted(text: string): string {
	return text.split("\n").map(line => (line.length === 0 ? ">" : `> ${line}`)).join("\n");
}

/** Agent names of a pi-subagents call, never the assignment bodies. */
function subagentNames(args: Record<string, unknown>): string {
	const names: string[] = [];
	if (typeof args.agent === "string") names.push(args.agent);
	for (const key of ["tasks", "chain"]) {
		const list = args[key];
		if (!Array.isArray(list)) continue;
		for (const step of list) {
			if (step && typeof step === "object" && "agent" in step && typeof step.agent === "string") names.push(step.agent);
		}
	}
	if (names.length > 0) return names.join(", ");
	return [args.action, args.id].filter(value => typeof value === "string" && value !== "").join(" ");
}

/** Argument keys that name what a third-party tool acted on, most specific first. */
const FALLBACK_TARGET_KEYS = ["path", "file", "url", "query", "command", "pattern", "name"];

function toolTarget(call: ToolCall): string {
	const args: Record<string, unknown> = call.arguments ?? {};
	let target = "";
	switch (call.name) {
		case "read":
		case "write":
		case "edit":
		case "ls":
			target = targetText(args.path);
			break;
		case "bash":
			target = targetText(args.command).split(/\r?\n/, 1)[0].slice(0, 80);
			break;
		case "grep":
		case "find": {
			const where = targetText(args.path);
			target = targetText(args.pattern) + (where ? ` in ${where}` : "");
			break;
		}
		case "web_search":
			target = Array.isArray(args.queries) ? args.queries.map(targetText).join(" | ") : targetText(args.query);
			break;
		case "fetch_content":
			target = Array.isArray(args.urls) ? args.urls.map(targetText).join(" ") : targetText(args.url);
			break;
		case "subagent":
			target = subagentNames(args);
			break;
		default: {
			const key = FALLBACK_TARGET_KEYS.find(name => typeof args[name] === "string" && args[name] !== "");
			target = key ? targetText(args[key]) : "";
		}
	}
	// Collapse whitespace before capping: a newline would break the
	// one-artifact-per-line bracket invariant.
	return target.replace(/\s+/g, " ").trim().slice(0, SPEECH_TOOLS[call.name] ? SPEECH_CAP : TARGET_CAP);
}

function toolLine(call: ToolCall, result: ToolResultMessage | undefined): string {
	const target = toolTarget(call);
	return `${call.name}${target ? ` ${target}` : ""}${result?.isError ? " — FAILED" : ""}`;
}

type TracedItem = { baseLine: string; span?: ArchiveSpan };

/** Consecutive identical calls collapse to `×N`; their archive spans merge into one range. */
function formatTracedItems(items: TracedItem[], archived: boolean): string[] {
	const lines: string[] = [];
	for (let i = 0; i < items.length; ) {
		let end = i + 1;
		while (
			end < items.length &&
			items[end].baseLine === items[i].baseLine &&
			(!items[end].span || !items[end - 1].span || items[end].span!.startLine > items[end - 1].span!.endLine)
		) {
			end++;
		}
		const count = end - i;
		const base = count === 1 ? items[i].baseLine : `${items[i].baseLine} ×${count}`;
		const firstSpan = items[i].span;
		const lastSpan = items[end - 1].span;
		const recover = archived && firstSpan && lastSpan ? `; recover: L${firstSpan.startLine}-${lastSpan.endLine}` : "";
		lines.push(quoted(`[${TRACE_PREFIX}${base}${recover}]`));
		i = end;
	}
	return lines;
}

function toolResultText(message: ToolResultMessage): string {
	return message.content
		.filter((block): block is TextContent => block.type === "text")
		.map(block => block.text)
		.join("\n");
}

/** Every tool result on the branch, keyed by the call it answers. */
function resultsOf(entries: SessionEntry[]): Map<string, ToolResultMessage> {
	const results = new Map<string, ToolResultMessage>();
	for (const entry of entries) {
		if (entry.type === "message" && entry.message.role === "toolResult") results.set(entry.message.toolCallId, entry.message);
	}
	return results;
}

/**
 * Pi's own projection rule (session-format: "the latest edit on the active
 * branch wins"): `null` omits the target, anything else replaces its content.
 * Without this, a fork would resurrect replies Pi already dropped from context.
 */
export function applyContextEdits(entries: SessionEntry[]): SessionEntry[] {
	const edits = new Map<string, Extract<SessionEntry, { type: "context_edit" }>["replacement"]>();
	for (const entry of entries) if (entry.type === "context_edit") edits.set(entry.targetId, entry.replacement);
	if (edits.size === 0) return entries.filter(entry => entry.type !== "context_edit");
	const out: SessionEntry[] = [];
	for (const entry of entries) {
		if (entry.type === "context_edit") continue;
		if (!edits.has(entry.id)) {
			out.push(entry);
			continue;
		}
		const replacement = edits.get(entry.id);
		if (replacement === null || replacement === undefined) continue;
		if (entry.type === "message") {
			const role = entry.message.role;
			const content =
				typeof replacement.content === "string" && (role === "assistant" || role === "toolResult")
					? [asText(replacement.content)]
					: replacement.content;
			out.push({ ...entry, message: { ...entry.message, content } as typeof entry.message });
		} else if (entry.type === "custom_message") {
			out.push({ ...entry, content: replacement.content as CustomContent });
		} else {
			out.push(entry);
		}
	}
	return out;
}

/** Pi's `/skill:name` expansion (agent-session.ts parseSkillBlock). */
const SKILL_BLOCK = /^<skill name="([^"]+)" location="([^"]+)">\n([\s\S]*?)\n<\/skill>(?:\n\n([\s\S]+))?$/;

type SkillBlock = { name: string; location: string; body: string; args?: string };

function parseSkillBlock(text: string): SkillBlock | undefined {
	const match = SKILL_BLOCK.exec(text);
	if (!match) return undefined;
	return { name: match[1], location: match[2], body: match[3], args: match[4]?.trim() || undefined };
}

/**
 * Skill injection reduced to one bracketed line. `brief` keeps the frontmatter
 * description plus the file to re-read; `bare` keeps only the invocation fact.
 * The user's prompt after the block always survives: it is conversation.
 */
function skillLine(skill: SkillBlock, level: "brief" | "bare"): string {
	let head = `[invoked skill: ${skill.name}`;
	if (level === "brief") {
		let description: string | undefined;
		try {
			const fileHead = readFileSync(skill.location, "utf8").slice(0, 4096);
			const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(fileHead)?.[1] ?? "";
			description = /^description:\s*(.+)$/m.exec(frontmatter)?.[1]?.trim();
		} catch {
			/* skill moved or deleted: the location still names it */
		}
		if (description) head += ` — ${description}`;
		head += ` · body trimmed, re-read ${skill.location} if needed`;
	} else {
		// Even at `bare`, say the body is gone: the reader must not assume a
		// directive it cannot see is still in force.
		head += " · body trimmed";
	}
	head += "]";
	return skill.args ? `${head}\n${skill.args}` : head;
}

/** Text parts of a user message, in order. */
function userTexts(content: string | Part[]): string[] {
	if (typeof content === "string") return [content];
	return content.filter((part): part is TextContent => part.type === "text").map(part => part.text);
}

/** `recover: L<start>-<end>` clauses written by an earlier /prose generation. */
const RECOVER_CLAUSE = /(;\s*recover:\s*)L(\d+)-(\d+)/g;

/** Lines of the previous generation's archive, read once; empty when it is gone. */
function readArchiveLines(file: string | undefined): string[] {
	if (!file) return [];
	try {
		return readFileSync(file, "utf8").split(/\r?\n/);
	} catch {
		return [];
	}
}

/**
 * Build the archive: discarded tool inputs and results, dropped reasoning,
 * trimmed skill bodies, and the slices earlier generations' links point at —
 * so every link in the fork resolves inside this one file.
 */
export function buildProseArchive(
	entries: SessionEntry[],
	keep: Keep,
	results: Map<string, ToolResultMessage>,
	sourceArchive?: string,
): ProseArchive {
	const lines: string[] = ["# Prose Archive", ""];
	const spansByCallId = new Map<string, ArchiveSpan>();
	const rebasedSpans = new Map<string, ArchiveSpan>();
	const priorLines = readArchiveLines(sourceArchive);
	let itemCount = 0;

	const section = (heading: string, body: string[]): ArchiveSpan => {
		itemCount++;
		const startLine = lines.length + 1;
		lines.push(`### [${itemCount}] ${heading}`);
		for (const line of body) lines.push(line);
		const span = { startLine, endLine: lines.length };
		lines.push("");
		return span;
	};

	const rebase = (text: string) => {
		for (const match of text.matchAll(RECOVER_CLAUSE)) {
			const key = `L${match[2]}-${match[3]}`;
			if (rebasedSpans.has(key)) continue;
			const start = Math.max(1, Number(match[2]));
			const end = Math.min(priorLines.length, Number(match[3]));
			if (start > end) continue;
			rebasedSpans.set(key, section(`prior ${key}`, priorLines.slice(start - 1, end)));
		}
	};

	for (const entry of entries) {
		if (entry.type === "custom_message") {
			if (typeof entry.content === "string") rebase(entry.content);
			else for (const part of entry.content) if (part.type === "text") rebase(part.text);
			continue;
		}
		if (entry.type !== "message") continue;
		const message = entry.message;
		if (message.role === "user") {
			for (const text of userTexts(message.content)) {
				const skill = keep.skills === "full" ? undefined : parseSkillBlock(text);
				if (skill) section(`skill: ${skill.name}`, skill.body.split("\n"));
				else rebase(text);
			}
		} else if (message.role === "assistant") {
			for (const part of message.content) {
				if (part.type === "toolCall" && levelFor(keep.tools, part.name) === "trace") {
					const target = toolTarget(part);
					const body = ["- Arguments:", ...JSON.stringify(part.arguments ?? {}, null, 2).split("\n")];
					const result = results.get(part.id);
					if (result) {
						body.push(`- Result${result.isError ? " (FAILED)" : ""}:`);
						const text = toolResultText(result);
						const images = result.content.filter(block => block.type === "image").length;
						if (text.length > 0) body.push(...text.split("\n"));
						else body.push(images > 0 ? `[${images} image(s)]` : "(empty output)");
					} else {
						body.push("- Result: (no result recorded)");
					}
					spansByCallId.set(part.id, section(`${part.name}${target ? ` ${target}` : ""}`, body));
				} else if (part.type === "thinking" && !keep.thinking && part.thinking.trim().length > 0) {
					section("thinking", part.thinking.split("\n"));
				} else if (part.type === "text") {
					rebase(part.text);
				}
			}
		}
	}

	return { content: lines.join("\n"), spansByCallId, itemCount, rebasedSpans };
}

/** Point prior-generation links at their copies in this archive, or say they are gone. */
function rebaseLinks(text: string, archived: boolean, rebasedSpans?: Map<string, ArchiveSpan>): string {
	return text.replace(RECOVER_CLAUSE, (_match, prefix: string, start: string, end: string) => {
		const key = `L${start}-${end}`;
		const span = archived ? rebasedSpans?.get(key) : undefined;
		return span ? `${prefix}L${span.startLine}-${span.endLine}` : `; unrecoverable (was ${key})`;
	});
}

/**
 * Thinking carries a signature valid only for the model that produced it, so
 * it is always rendered down to delimited text. A ToolCall at `full` stays a
 * ToolCall paired with its result; at every other level it collapses to a
 * trace line or vanishes. Text is re-wrapped, dropping `textSignature`.
 * Empty parts are skipped: encrypted reasoning persists as `thinking: ""`.
 */
function assistantParts(
	message: AssistantMessage,
	keep: Keep,
	results: Map<string, ToolResultMessage>,
	spans: Map<string, ArchiveSpan> | undefined,
	archived: boolean,
	rebasedSpans: Map<string, ArchiveSpan> | undefined,
): { segments: AssistantSegment[]; pendingResults: ToolResultMessage[] } {
	const segments: AssistantSegment[] = [];
	const pendingResults: ToolResultMessage[] = [];
	let tracedItems: TracedItem[] = [];
	const pushAssistantText = (text: string, textKind: AssistantTextKind) => {
		if (text.trim().length > 0) segments.push({ part: asText(text), textKind });
	};
	const flushTools = () => {
		if (tracedItems.length > 0) {
			pushAssistantText(formatTracedItems(tracedItems, archived).join("\n"), "trimmed");
			tracedItems = [];
		}
	};
	for (const part of message.content) {
		if (part.type === "toolCall") {
			const level = levelFor(keep.tools, part.name);
			if (level === "trace") {
				tracedItems.push({ baseLine: toolLine(part, results.get(part.id)), span: spans?.get(part.id) });
			} else if (level === "full") {
				// A native call cannot join a `×N` run; flush first so ordering survives.
				flushTools();
				segments.push({ part: { type: "toolCall", id: part.id, name: part.name, arguments: part.arguments ?? {} } });
				pendingResults.push(resultFor(part, results.get(part.id)));
			}
			continue;
		}
		flushTools();
		if (part.type === "text") {
			pushAssistantText(rebaseLinks(part.text, archived, rebasedSpans), "prose");
		} else if (part.type === "thinking" && keep.thinking && part.thinking.trim().length > 0) {
			// Own text kind so the join puts one empty line on each side; every
			// line is quoted because that empty line ends a blockquote.
			pushAssistantText(quoted(`[thinking]\n${part.thinking.trim()}\n[/thinking]`), "thinking");
		}
	}
	flushTools();
	return { segments, pendingResults };
}

/**
 * Pair a `full` call with its result; an aborted call gets a synthesized error
 * rather than an orphan toolCall the next request would reject. Nested-call
 * usage is dropped: the original session already counted it.
 */
function resultFor(call: ToolCall, result: ToolResultMessage | undefined): ToolResultMessage {
	if (!result) {
		return {
			role: "toolResult",
			toolCallId: call.id,
			toolName: call.name,
			content: [asText("No result recorded: the call was aborted or never answered")],
			isError: true,
			timestamp: Date.now(),
		};
	}
	const content: Part[] = [];
	for (const part of result.content) {
		if (part.type === "image") content.push(part);
		else if (part.text.length > 0) content.push(asText(part.text));
	}
	if (content.length === 0) content.push(asText(result.isError ? "error" : "(empty)"));
	return {
		role: "toolResult",
		toolCallId: call.id,
		toolName: result.toolName || call.name,
		content,
		isError: result.isError,
		timestamp: result.timestamp,
		...(result.details !== undefined ? { details: result.details } : {}),
	};
}

/** Story-mode rendering of a native call: a user turn cannot carry toolCall / toolResult roles. */
function fullCallText(call: ToolCall, result: ToolResultMessage | undefined): string {
	const lines = [`[${TRACE_PREFIX}${call.name}]`, "[args]", JSON.stringify(call.arguments ?? {}, null, 2), "[/args]"];
	if (!result) {
		lines.push("[no result recorded: the call was aborted or never answered]");
		return lines.join("\n");
	}
	const text = toolResultText(result);
	const empty = text === "" && !result.content.some(part => part.type === "image");
	const marks = [result.isError && "FAILED", empty && "empty"].filter(Boolean).join(" · ");
	lines.push(`[result${marks ? ` — ${marks}` : ""}]`);
	if (text) lines.push(text, "[/result]");
	return lines.join("\n");
}

function hasReadableThinking(entries: SessionEntry[]): boolean {
	for (const entry of entries) {
		if (entry.type !== "message" || entry.message.role !== "assistant") continue;
		for (const part of entry.message.content) if (part.type === "thinking" && part.thinking.trim().length > 0) return true;
	}
	return false;
}

function compactionBlock(entry: Extract<SessionEntry, { type: "compaction" }>): ProseItem {
	const readFiles = (entry.details as { readFiles?: string[] } | undefined)?.readFiles;
	const files = readFiles?.length ? `\n\nFiles read in the summarized region:\n${readFiles.join("\n")}` : "";
	return {
		kind: "custom",
		customType: "compaction-summary",
		content: `[summary from an earlier compaction of this branch]\n${entry.summary}${files}`,
		display: true,
	};
}

function branchSummaryBlock(entry: Extract<SessionEntry, { type: "branch_summary" }>): ProseItem {
	return {
		kind: "custom",
		customType: "branch-summary",
		content: `[summary of a branch explored after this point]\n${entry.summary}`,
		display: true,
	};
}

/**
 * Reduce a branch to replayable conversation. System prompts, `!` shell runs,
 * and provider bookkeeping disappear; custom messages and summaries stay.
 */
export function proseOf(
	entries: SessionEntry[],
	keep: Keep,
	spans?: Map<string, ArchiveSpan>,
	archived = false,
	rebasedSpans?: Map<string, ArchiveSpan>,
): ProseItem[] {
	const results = resultsOf(entries);
	const out: ProseItem[] = [];
	const assistantTailKinds = new WeakMap<object, AssistantTextKind>();

	const pushUser = (parts: Part[], timestamp: number) => {
		if (parts.length === 0) return;
		const previous = out.at(-1);
		if (previous?.kind === "message" && previous.message.role === "user") {
			(previous.message.content as Part[]).push(...parts);
			return;
		}
		out.push({ kind: "message", message: { role: "user", content: parts, timestamp } });
	};

	const pushAssistant = (message: AssistantMessage, segments: AssistantSegment[]) => {
		if (segments.length === 0) return;
		const previous = out.at(-1);
		// Dropping tool results leaves assistant turns adjacent; merge so
		// spacing survives the seam too.
		if (previous?.kind === "message" && previous.message.role === "assistant") {
			const tailKind = appendAssistantSegments(previous.message.content as AssistantPart[], segments, assistantTailKinds.get(previous.message));
			if (tailKind) assistantTailKinds.set(previous.message, tailKind);
			else assistantTailKinds.delete(previous.message);
			return;
		}
		const tailKind = appendAssistantSegments(message.content as AssistantPart[], segments);
		out.push({ kind: "message", message });
		if (tailKind) assistantTailKinds.set(message, tailKind);
	};

	for (const entry of entries) {
		if (entry.type === "message") {
			const message = entry.message;
			if (message.role === "user") {
				const parts: Part[] = [];
				if (typeof message.content === "string") {
					pushUserText(parts, message.content, keep, archived, rebasedSpans);
				} else {
					for (const part of message.content) {
						if (part.type === "text") pushUserText(parts, part.text, keep, archived, rebasedSpans);
						else parts.push(part);
					}
				}
				pushUser(parts, message.timestamp);
			} else if (message.role === "assistant") {
				const { segments, pendingResults } = assistantParts(message, keep, results, spans, archived, rebasedSpans);
				const hasToolCalls = segments.some(segment => segment.part.type === "toolCall");
				pushAssistant(
					{
						role: "assistant",
						content: [],
						api: message.api,
						provider: message.provider,
						model: message.model,
						// The copy spent none of these tokens; Pi estimates context
						// until the next real turn re-anchors it.
						usage: {
							input: 0,
							output: 0,
							cacheRead: 0,
							cacheWrite: 0,
							totalTokens: 0,
							cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
						},
						// A turn whose calls were all traced or erased must not keep a
						// toolUse stop that expects results this fork no longer emits.
						stopReason: hasToolCalls ? "toolUse" : message.stopReason === "toolUse" ? "stop" : message.stopReason,
						...(message.errorMessage !== undefined ? { errorMessage: message.errorMessage } : {}),
						timestamp: message.timestamp,
					},
					segments,
				);
				// Native results follow their assistant immediately, never deferred
				// past the next assistant (that would orphan the call).
				for (const result of pendingResults) out.push({ kind: "message", message: result });
			}
		} else if (entry.type === "custom_message") {
			// Notes from an earlier /prose describe a region this run supersedes.
			if (entry.customType === "prose-note") continue;
			out.push({
				kind: "custom",
				customType: entry.customType,
				content: typeof entry.content === "string" ? rebaseLinks(entry.content, archived, rebasedSpans) : entry.content,
				display: entry.display,
				details: entry.details,
			});
		} else if (entry.type === "compaction") {
			out.push(compactionBlock(entry));
		} else if (entry.type === "branch_summary") {
			out.push(branchSummaryBlock(entry));
		}
	}

	// An assistant message cannot open replayable history; a custom opener can.
	while (out[0]?.kind === "message" && out[0].message.role !== "user") out.shift();
	return out;
}

function pushUserText(parts: Part[], text: string, keep: Keep, archived: boolean, rebasedSpans?: Map<string, ArchiveSpan>): void {
	const skill = keep.skills === "full" ? undefined : parseSkillBlock(text);
	pushText(parts, skill ? skillLine(skill, keep.skills === "bare" ? "bare" : "brief") : rebaseLinks(text, archived, rebasedSpans));
}

/**
 * `story` folds the distilled items into ONE user message with bracketed
 * speaker markers. Images split the text around themselves; native calls fall
 * back to their text form, since a user turn cannot carry toolCall roles.
 */
export function storyFold(items: ProseItem[]): ProseItem[] {
	const parts: Part[] = [];
	let buffer: string[] = [];
	const flush = () => {
		if (buffer.length > 0) {
			pushText(parts, buffer.join("\n\n"));
			buffer = [];
		}
	};
	const resultsById = new Map<string, ToolResultMessage>();
	for (const item of items) {
		if (item.kind === "message" && item.message.role === "toolResult") resultsById.set(item.message.toolCallId, item.message);
	}
	const fold = (marker: string, content: CustomContent | (Part | AssistantPart)[]) => {
		buffer.push(marker);
		if (typeof content === "string") {
			if (content.trim().length > 0) buffer.push(content);
			return;
		}
		for (const part of content) {
			if (part.type === "text") {
				if (part.text.trim().length > 0) buffer.push(part.text);
			} else if (part.type === "image") {
				flush();
				parts.push(part);
			} else if (part.type === "toolCall") {
				const result = resultsById.get(part.id);
				buffer.push(fullCallText(part, result));
				for (const resultPart of result?.content ?? []) {
					if (resultPart.type === "image") {
						flush();
						parts.push(resultPart);
					}
				}
			}
		}
	};
	for (const item of items) {
		if (item.kind === "custom") fold(`[@system ${item.customType}]`, item.content);
		else if (item.message.role === "user") fold("[@user]", item.message.content as Part[]);
		else if (item.message.role === "assistant") fold("[@assistant]", item.message.content as AssistantPart[]);
	}
	flush();
	if (parts.length === 0) return [];
	return [{ kind: "message", message: { role: "user", content: parts, timestamp: Date.now() } }];
}

type ParsedFlags = { keep: Keep; compacted?: boolean; unknown?: string };

/** `±tools` sets every tool; `±tools=a,b` overrides those names only. */
const TOOLS_FLAG = /^([+-])tools?(?:=(.+))?$/;

export function parseFlags(args: string): ParsedFlags {
	const keep: Keep = { thinking: false, tools: { default: "trace", byName: new Map() }, skills: "brief", story: false };
	const parsed: ParsedFlags = { keep };
	for (const token of args.trim().split(/\s+/).filter(Boolean)) {
		const tools = TOOLS_FLAG.exec(token);
		if (tools) {
			const level: ToolLevel = tools[1] === "+" ? "full" : "none";
			if (tools[2] === undefined) keep.tools.default = level;
			else for (const name of tools[2].split(",").filter(Boolean)) keep.tools.byName.set(name, level);
		} else if (token === "+think" || token === "+thinking") keep.thinking = true;
		else if (token === "+compacted") parsed.compacted = true;
		else if (token === "+skills") keep.skills = "full";
		else if (token === "-skills") keep.skills = "bare";
		else if (token === "story") keep.story = true;
		else return { ...parsed, unknown: token };
	}
	return parsed;
}

/**
 * Where Pi starts emitting context: the compaction's kept tail (the entry
 * itself re-renders as a summary block), or the whole branch.
 */
function emissionStart(entries: SessionEntry[]): number {
	let compaction = -1;
	for (let i = 0; i < entries.length; i++) if (entries[i].type === "compaction") compaction = i;
	if (compaction < 0) return 0;
	const keptId = (entries[compaction] as Extract<SessionEntry, { type: "compaction" }>).firstKeptEntryId;
	const kept = entries.findIndex(entry => entry.id === keptId);
	return kept >= 0 ? Math.min(kept, compaction) : compaction;
}

/** `<session>.jsonl` → `<session>.prose.md`, beside it. */
export const archivePathFor = (sessionFile: string): string => `${sessionFile.replace(/\.jsonl$/, "")}.prose.md`;

/** The archive an earlier /prose wrote for this branch, named on its opening note. */
function priorArchive(entries: SessionEntry[]): string | undefined {
	let found: string | undefined;
	for (const entry of entries) {
		if (entry.type !== "custom_message" || entry.customType !== "prose-note") continue;
		const archive = (entry.details as { archive?: unknown } | undefined)?.archive;
		if (typeof archive === "string") found = archive;
	}
	return found;
}

const resumeCommand = (sessionId: string): string => `pi --session ${sessionId}`;

/**
 * The framing entry that opens the distilled region: it defines the trace
 * artifacts before the model meets them and names where the full record lives.
 */
function proseNote(keep: Keep, original: string, archivePath?: string): ProseItem {
	const levels = levelsUsed(keep.tools);
	const recoverSyntax = archivePath ? "; recover: Lstart-end" : "";
	const traces = levels.has("trace")
		? ` Lines formatted as [${TRACE_PREFIX}tool target${recoverSyntax}] are records of tool calls that already ran. To act, ALWAYS invoke a real tool through the tool interface — writing a [${TRACE_PREFIX}…] line as text does nothing and fabricates history.`
		: "";
	const full = levels.has("full")
		? keep.story
			? ` A call kept whole appears as [${TRACE_PREFIX}tool] followed by verbatim [args]…[/args] and [result]…[/result] blocks inside the story — a record of what already ran, never a template to write out.`
			: " Tool calls kept whole remain native toolCall / toolResult turns (arguments and output verbatim). They are history that already ran — continue by invoking real tools through the tool interface, not by writing tool JSON into the message."
		: "";
	// Wording is load-bearing: advertising that "reasoning survives verbatim"
	// triggers Anthropic's reasoning_extraction refusal. Describe the markers only.
	const think = keep.thinking ? " Text between [thinking]…[/thinking] markers is working context for the reply, not part of it." : "";
	const story = keep.story
		? " The entire exchange is folded into the single message that follows; bracketed markers [@user], [@assistant], and [@system …] label who actually spoke."
		: "";
	const archiveNote = archivePath
		? `, with discarded tool outputs archived in ${archivePath}${levels.has("trace") ? " (a recover: Lstart-end suffix names the lines that hold that call)" : ""}`
		: "";
	return {
		kind: "custom",
		customType: "prose-note",
		content: `[The conversation from this point on was distilled by /prose: provider bookkeeping and everything not kept below were removed — the prose itself is verbatim.${traces}${full}${think}${story} The unabridged original is ${original}${archiveNote}.]`,
		display: true,
		...(archivePath ? { details: { archive: archivePath } } : {}),
	};
}

/** Restates the one rule that matters at the seam where generation resumes. */
function proseTail(keep: Keep): ProseItem {
	const levels = levelsUsed(keep.tools);
	const traces =
		levels.has("trace") || (levels.has("full") && keep.story)
			? ` — never by writing [${TRACE_PREFIX.trim()} …] lines as text`
			: levels.has("full")
				? " — never by pasting toolCall / toolResult JSON into the message"
				: "";
	return {
		kind: "custom",
		customType: "prose-note",
		content: `[End of distilled history; the conversation is live from here. To act, ALWAYS make real tool calls${traces}.]`,
		display: true,
	};
}

/** The subset of Pi's SessionManager the fork setup writes through. */
interface ForkSession {
	getSessionFile(): string | undefined;
	appendMessage(message: Message): string;
	appendCustomMessageEntry(customType: string, content: CustomContent, display: boolean, details?: unknown): string;
	appendSessionInfo(name: string): string;
}

function appendItems(session: ForkSession, items: ProseItem[]): void {
	for (const item of items) {
		if (item.kind === "message") session.appendMessage(item.message);
		else session.appendCustomMessageEntry(item.customType, item.content, item.display, item.details);
	}
}

/** Write the archive beside the fork's session file; undefined when there is nowhere durable to put it. */
function writeArchive(sessionFile: string | undefined, content: string): string | undefined {
	if (!sessionFile) return undefined;
	const file = archivePathFor(sessionFile);
	try {
		mkdirSync(path.dirname(file), { recursive: true });
		writeFileSync(file, content);
		return file;
	} catch {
		return undefined;
	}
}

const FLAG_COMPLETIONS: AutocompleteItem[] = [
	{ value: "+tools", label: "+tools", description: "keep tool calls and results verbatim (+tools=read,edit for some)" },
	{ value: "-tools", label: "-tools", description: "erase tool calls (-tools=bash for some); default traces all" },
	{ value: "+skills", label: "+skills", description: "keep skill bodies verbatim" },
	{ value: "-skills", label: "-skills", description: "skill invocations shrink to name + prompt" },
	{ value: "+think", label: "+think", description: "keep readable reasoning in [thinking]…[/thinking]" },
	{ value: "+compacted", label: "+compacted", description: "also distill history sealed by a compaction" },
	{ value: "story", label: "story", description: "fold everything into one user message with [@user]/[@assistant] markers" },
];

export default function proseExtension(pi: ExtensionAPI) {
	pi.registerCommand("prose", {
		description: "[story ±tools[=a,b] ±skills +think +compacted] — fork into a prose-only session",
		getArgumentCompletions: (argumentPrefix: string): AutocompleteItem[] | null => {
			const token = argumentPrefix.split(/\s+/).at(-1) ?? "";
			if (token === "") return null;
			const matches = FLAG_COMPLETIONS.filter(item => item.value.startsWith(token));
			return matches.length > 0 ? matches : null;
		},
		handler: async (args, ctx) => {
			if (!ctx.isIdle()) {
				ctx.ui.notify("Prose needs an idle agent.", "warning");
				return;
			}
			const parsed = parseFlags(args);
			if (parsed.unknown !== undefined) {
				ctx.ui.notify(
					`Unknown option \`${parsed.unknown}\`. Pi's /prose only forks; it takes story, ±tools[=a,b], ±skills, +think, and +compacted.`,
					"warning",
				);
				return;
			}
			const { keep } = parsed;

			const branch = ctx.sessionManager.getBranch();
			const entries = applyContextEdits(branch);
			// History a compaction sealed stays sealed unless asked: distilling it
			// re-emits what Pi already dropped, and the fork can outgrow its source.
			const window = parsed.compacted ? entries : entries.slice(emissionStart(entries));
			if (keep.thinking && !hasReadableThinking(window)) {
				ctx.ui.notify("+think: this branch stored no readable reasoning (encrypted by the provider).", "warning");
			}
			if (proseOf(window, keep).length === 0) {
				ctx.ui.notify("Nothing to distill: no conversation on this branch.", "warning");
				return;
			}

			// Read everything source-bound now: newSession() replaces the session
			// and the old context goes stale.
			const sourceFile = ctx.sessionManager.getSessionFile();
			const sourceId = ctx.sessionManager.getSessionId();
			const sourceTitle = ctx.sessionManager.getSessionName();
			const original = sourceFile ? `the parent session (${resumeCommand(sourceId)})` : "the parent session (in memory, not saved)";
			const archive = buildProseArchive(window, keep, resultsOf(window), priorArchive(branch));
			let messageCount = 0;
			let archivePath: string | undefined;

			await ctx.newSession({
				parentSession: sourceFile,
				setup: async sessionManager => {
					const fork = sessionManager as unknown as ForkSession;
					archivePath = archive.itemCount > 0 ? writeArchive(fork.getSessionFile(), archive.content) : undefined;
					const items = proseOf(window, keep, archive.spansByCallId, archivePath !== undefined, archive.rebasedSpans);
					messageCount = items.filter(item => item.kind === "message").length;
					appendItems(fork, [proseNote(keep, original, archivePath), ...(keep.story ? storyFold(items) : items), proseTail(keep)]);
					if (sourceTitle) fork.appendSessionInfo(`${sourceTitle} · ${keep.story ? "story" : "prose"}`);
				},
				withSession: async next => {
					const toolFlags = (level: ToolLevel, sign: string) => {
						const named = [...keep.tools.byName].filter(([, set]) => set === level).map(([name]) => name);
						return [keep.tools.default === level && `${sign}tools`, named.length > 0 && `${sign}tools=${named.join(",")}`];
					};
					const flags = [
						keep.thinking && "+think",
						...toolFlags("full", "+"),
						...toolFlags("none", "-"),
						keep.skills === "full" && "+skills",
						keep.skills === "bare" && "-skills",
						parsed.compacted && "+compacted",
					]
						.filter(Boolean)
						.join(" ");
					const back = sourceFile ? ` — \`${resumeCommand(sourceId)}\` to get back` : "";
					next.ui.notify(
						`Forked ${messageCount} messages into a ${keep.story ? "single-message story" : "prose-only"} session${flags ? ` (${flags})` : ""}${archivePath ? `; archive: ${archivePath}` : ""}${back}.`,
						"info",
					);
				},
			});
		},
	});
}
