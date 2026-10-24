import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI, SessionEntry } from "@earendil-works/pi-coding-agent";
import proseExtension, { applyContextEdits, archivePathFor, parseFlags, proseOf } from "./prose";

const SOURCE_ID = "00000000-0000-4000-8000-000000000002";
const SOURCE_FILE = `/sessions/2026-01-01T00-00-00-000Z_${SOURCE_ID}.jsonl`;

let tempDir: string;
beforeAll(() => {
	tempDir = mkdtempSync(path.join(os.tmpdir(), "pi-prose-test-"));
});
afterAll(() => {
	rmSync(tempDir, { recursive: true, force: true });
});

let nextId = 0;
const entry = (fields: Record<string, unknown>) => ({ id: `e${++nextId}`, parentId: null, timestamp: "2026-10-09T10:00:00.000Z", ...fields });
const user = (content: unknown) => entry({ type: "message", message: { role: "user", content, timestamp: 1 } });
const assistant = (content: unknown[], extra: Record<string, unknown> = {}) =>
	entry({
		type: "message",
		message: {
			role: "assistant",
			content,
			api: "openai-codex-responses",
			provider: "openai-codex",
			model: "gpt-5.5",
			responseId: "resp_live",
			usage: { input: 900, output: 40, cacheRead: 0, cacheWrite: 0, totalTokens: 940, cost: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, total: 2 } },
			stopReason: "stop",
			timestamp: 2,
			...extra,
		},
	});
const toolResult = (toolCallId: string, toolName: string, text: string, isError = false) =>
	entry({ type: "message", message: { role: "toolResult", toolCallId, toolName, content: [{ type: "text", text }], isError, timestamp: 3 } });
const call = (id: string, name: string, args: Record<string, unknown>) => ({ type: "toolCall", id, name, arguments: args });

type Appended = { customType?: string; content: unknown; details?: unknown; role?: string };

/** Drive the real handler over fake Pi surfaces: the source session, the fork's manager, and the replacement context. */
async function runProse(
	args: string,
	branch: unknown[],
	options: { forkFile?: string | null; sourceFile?: string | null } = {},
) {
	let handler: ((args: string, ctx: unknown) => Promise<void>) | undefined;
	proseExtension({
		registerCommand: (_name: string, command: { handler: typeof handler }) => {
			handler = command.handler;
		},
	} as unknown as ExtensionAPI);
	if (!handler) throw new Error("/prose did not register");

	const staleNotices: string[] = [];
	const freshNotices: string[] = [];
	const appended: Appended[] = [];
	const parentSessions: Array<string | undefined> = [];
	const forkFile = options.forkFile === null ? undefined : (options.forkFile ?? path.join(tempDir, `fork-${++nextId}.jsonl`));
	const fork = {
		getSessionFile: () => forkFile,
		appendMessage: (message: { role: string; content: unknown }) => appended.push({ role: message.role, content: message.content }),
		appendCustomMessageEntry: (customType: string, content: unknown, _display: boolean, details?: unknown) =>
			appended.push({ customType, content, details }),
		appendSessionInfo: () => "info",
	};
	let forked = false;
	const ctx = {
		isIdle: () => true,
		hasUI: true,
		ui: { notify: (message: string) => staleNotices.push(message) },
		sessionManager: {
			getBranch: () => branch,
			getSessionFile: () => (options.sourceFile === null ? undefined : (options.sourceFile ?? SOURCE_FILE)),
			getSessionId: () => SOURCE_ID,
			getSessionName: () => "build triage",
		},
		newSession: async (opts: {
			parentSession?: string;
			setup: (manager: unknown) => Promise<void>;
			withSession?: (next: unknown) => Promise<void>;
		}) => {
			forked = true;
			parentSessions.push(opts.parentSession);
			await opts.setup(fork);
			await opts.withSession?.({ ui: { notify: (message: string) => freshNotices.push(message) } });
			return { cancelled: false };
		},
	};
	await handler(args, ctx);
	const texts = appended.map(item =>
		typeof item.content === "string"
			? item.content
			: (item.content as Array<{ type: string; text?: string }>).map(part => part.text ?? `[${part.type}]`).join("\n"),
	);
	return { staleNotices, freshNotices, appended, texts, parentSessions, forkFile, forked };
}

const lineRange = (file: string, start: number, end: number) => readFileSync(file, "utf8").split("\n").slice(start - 1, end);

describe("bare /prose on Pi", () => {
	const branch = [
		entry({ type: "message", message: { role: "system", content: "SYSTEM PROMPT TEXT", timestamp: 0 } }),
		user("check config and test"),
		assistant([{ type: "text", text: "Looking." }, call("c1", "read", { path: "config.ts" }), call("c2", "bash", { command: "npm test" })], {
			stopReason: "toolUse",
		}),
		toolResult("c1", "read", "export default { poll: true }"),
		toolResult("c2", "bash", "FAIL 3 tests", true),
		assistant([{ type: "text", text: "poll is on." }]),
	];

	test("writes the archive beside the fork, and each recover range holds that call", async () => {
		const run = await runProse("", branch);
		const archive = archivePathFor(run.forkFile!);
		expect(existsSync(archive)).toBe(true);

		const reply = run.appended.find(item => item.role === "assistant");
		const replyText = (reply!.content as Array<{ text: string }>).map(part => part.text).join("\n");
		const read = /\[ran read config\.ts; recover: L(\d+)-(\d+)\]/.exec(replyText);
		expect(read).not.toBeNull();
		const readLines = lineRange(archive, Number(read![1]), Number(read![2]));
		expect(readLines[0]).toBe("### [1] read config.ts");
		expect(readLines).toContain("export default { poll: true }");
		expect(readLines).not.toContain("FAIL 3 tests");
		expect(replyText).toMatch(/\[ran bash npm test — FAILED; recover: L\d+-\d+\]/);

		const note = run.appended[0];
		expect(note.customType).toBe("prose-note");
		expect(String(note.content)).toContain(archive);
		expect(note.details).toEqual({ archive });
		expect(run.texts.some(text => text.includes("SYSTEM PROMPT TEXT"))).toBe(false);
	});

	test("links the fork to its parent and reports through the replacement session", async () => {
		const run = await runProse("", branch);
		expect(run.parentSessions).toEqual([SOURCE_FILE]);
		// The pre-fork context is stale after newSession(); nothing may speak through it.
		expect(run.staleNotices).toEqual([]);
		expect(run.freshNotices.some(text => text.includes(`pi --session ${SOURCE_ID}`))).toBe(true);
		expect(String(run.appended[0].content)).toContain(`pi --session ${SOURCE_ID}`);
	});

	test("an in-memory fork gets no archive and no dangling recover links", async () => {
		const run = await runProse("", branch, { forkFile: null, sourceFile: null });
		expect(run.forked).toBe(true);
		expect(run.parentSessions).toEqual([undefined]);
		expect(run.texts.some(text => text.includes("recover:"))).toBe(false);
		expect(run.texts.some(text => text.includes("[ran read config.ts]"))).toBe(true);
		expect(String(run.appended[0].content)).toContain("in memory, not saved");
		expect(run.freshNotices.some(text => text.includes("pi --session"))).toBe(false);
	});

	test("omp-only forms are refused without forking", async () => {
		for (const args of ["3", "^2", "-sub"]) {
			const run = await runProse(args, branch);
			expect(run.forked).toBe(false);
			expect(run.staleNotices.some(text => text.includes(`Unknown option \`${args}\``))).toBe(true);
		}
	});
});

describe("context edits", () => {
	test("a reply Pi dropped stays dropped; a replaced message uses its replacement", () => {
		const question = user("original question");
		const failed = assistant([{ type: "text", text: "partial junk" }], { stopReason: "error", errorMessage: "Codex error" });
		const branch = [
			question,
			failed,
			entry({ type: "context_edit", targetId: failed.id, replacement: null }),
			assistant([{ type: "text", text: "real answer" }]),
			entry({ type: "context_edit", targetId: question.id, replacement: { content: "edited question" } }),
		] as unknown as SessionEntry[];

		const items = proseOf(applyContextEdits(branch), parseFlags("").keep);
		const flat = JSON.stringify(items);
		expect(flat).not.toContain("partial junk");
		expect(flat).not.toContain("original question");
		expect(items.map(item => (item.kind === "message" ? item.message.role : item.customType))).toEqual(["user", "assistant"]);
		expect(flat).toContain("edited question");
	});
});

describe("compaction", () => {
	const kept = user("kept question");
	const branch = [
		user("old question"),
		assistant([{ type: "text", text: "old answer" }]),
		kept,
		assistant([{ type: "text", text: "kept answer" }]),
		entry({ type: "compaction", summary: "SUMMARY", firstKeptEntryId: kept.id, tokensBefore: 5000 }),
		user("new question"),
		assistant([{ type: "text", text: "new answer" }]),
	];

	test("the bare fork distills only what Pi still emits", async () => {
		const { texts } = await runProse("", branch);
		const all = texts.join("\n");
		expect(all).not.toContain("old question");
		expect(all).toContain("[summary from an earlier compaction of this branch]\nSUMMARY");
		expect(all).toContain("kept question");
		expect(all).toContain("new answer");
	});

	test("+compacted reaches the sealed history too", async () => {
		const { texts } = await runProse("+compacted", branch);
		expect(texts.join("\n")).toContain("old question");
	});
});

describe("skills", () => {
	const skillBranch = () => {
		const dir = path.join(tempDir, "demo-skill");
		mkdirSync(dir, { recursive: true });
		const location = path.join(dir, "SKILL.md");
		writeFileSync(location, "---\nname: demo\ndescription: Reviews things\n---\n\nDo the thing carefully.\n");
		const block = `<skill name="demo" location="${location}">\nReferences are relative to ${dir}.\n\nDo the thing carefully.\n</skill>\n\nplease review PR 12`;
		return { location, branch: [user([{ type: "text", text: block }]), assistant([{ type: "text", text: "Reviewed." }])] };
	};

	test("default trims the body to a pointer and archives it; the user's prompt survives", async () => {
		const { location, branch } = skillBranch();
		const run = await runProse("", branch);
		const prompt = run.appended.find(item => item.role === "user");
		expect((prompt!.content as Array<{ text: string }>)[0].text).toBe(
			`[invoked skill: demo — Reviews things · body trimmed, re-read ${location} if needed]\nplease review PR 12`,
		);
		expect(readFileSync(archivePathFor(run.forkFile!), "utf8")).toContain("### [1] skill: demo\nReferences are relative to");
	});

	test("-skills keeps only the fact; +skills keeps the block verbatim", async () => {
		const { branch } = skillBranch();
		const bare = await runProse("-skills", branch);
		expect(bare.texts).toContain("[invoked skill: demo · body trimmed]\nplease review PR 12");
		const full = await runProse("+skills", branch);
		expect(full.texts.some(text => text.startsWith('<skill name="demo"') && text.includes("Do the thing carefully."))).toBe(true);
	});
});

describe("re-prose of a prose fork", () => {
	test("prior recover links are copied into the new archive; lost ones say so", async () => {
		const prior = path.join(tempDir, "prior.prose.md");
		writeFileSync(prior, ["# Prose Archive", "", "### [1] read a.ts", "A-BODY", ""].join("\n"));
		const branch = [
			entry({ type: "custom_message", customType: "prose-note", content: "[old note]", display: true, details: { archive: prior } }),
			user("continue"),
			assistant([{ type: "text", text: "> [ran read a.ts; recover: L3-4]\n> [ran read b.ts; recover: L90-95]" }]),
		];
		const run = await runProse("", branch);
		expect(run.texts.some(text => text.includes("[old note]"))).toBe(false);
		const reply = run.texts.find(text => text.includes("[ran read a.ts"))!;
		const link = /\[ran read a\.ts; recover: L(\d+)-(\d+)\]/.exec(reply);
		expect(link).not.toBeNull();
		expect(lineRange(archivePathFor(run.forkFile!), Number(link![1]), Number(link![2]))).toEqual([
			"### [1] prior L3-4",
			"### [1] read a.ts",
			"A-BODY",
		]);
		expect(reply).toContain("[ran read b.ts; unrecoverable (was L90-95)]");
	});
});

describe("+think quote bar", () => {
	test("each block is quoted, closer included, with a blank line on both sides", () => {
		const branch = [
			user("go"),
			assistant(
				[
					call("c1", "bash", { command: "echo before" }),
					{ type: "thinking", thinking: "first paragraph\n\nsecond paragraph\n\n" },
					call("c2", "bash", { command: "echo after" }),
				],
				{ stopReason: "toolUse" },
			),
		] as unknown as SessionEntry[];
		const items = proseOf(branch, parseFlags("+think").keep);
		const reply = items.find(item => item.kind === "message" && item.message.role === "assistant");
		if (!reply || reply.kind !== "message") throw new Error("shape");
		expect((reply.message.content as Array<{ text: string }>).map(part => part.text).join("\n")).toBe(
			[
				"> [ran bash echo before]",
				"",
				"> [thinking]",
				"> first paragraph",
				">",
				"> second paragraph",
				"> [/thinking]",
				"",
				"> [ran bash echo after]",
			].join("\n"),
		);
	});
});
