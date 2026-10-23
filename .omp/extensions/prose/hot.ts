/**
 * Hot-loading entry for /prose.
 *
 * omp imports an extension module once per process, and a Paseo agent's omp
 * process can live for days, so edits to prose.ts never reached agents that
 * were already running. This entry registers /prose and the session hooks
 * once, then runs whichever prose.ts is current: every /prose run (and every
 * argument completion, in the background) re-imports prose.ts when its mtime
 * changed. If the new file fails to load, the previous version keeps running.
 *
 * Fixed at process start, so changing these still needs a restart: the
 * command description, the set of events prose.ts listens to, and the inline
 * hint wrapper (only the first instance installs it; see `replay`).
 */
import { statSync } from "node:fs";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type * as ProseModule from "./prose";

type CommandSpec = Parameters<ExtensionAPI["registerCommand"]>[1];
type EventHandler = (event: unknown, ctx: unknown) => unknown;
type Instance = { mtimeMs: number; command: CommandSpec; handlers: Map<string, EventHandler[]> };

const IMPL_PATH = new URL("./prose.ts", import.meta.url).pathname;
// Events whose ctx a fresh instance needs to catch up on (adopt() keeps the
// session manager that ^N completions read).
const REPLAYED_EVENTS = new Set(["session_start", "session_switch"]);

export default async function proseHotEntry(pi: ExtensionAPI) {
	// Per binding: omp may run this factory for several bindings in one process.
	let lastSessionEvent: { name: string; event: unknown; ctx: unknown } | undefined;

	const instantiate = async (mtimeMs: number): Promise<Instance> => {
		// Dynamic on purpose: a static import is cached for the process lifetime;
		// the mtime query makes Bun load the edited file as a fresh module.
		const mod: typeof ProseModule = await import(`${IMPL_PATH}?v=${mtimeMs}`);
		let command: CommandSpec | undefined;
		const handlers = new Map<string, EventHandler[]>();
		const capture = new Proxy(pi, {
			get(target, prop, receiver) {
				if (prop === "registerCommand") {
					return (name: string, spec: CommandSpec) => {
						if (name === "prose") command = spec;
					};
				}
				if (prop === "on") {
					return (name: string, handler: EventHandler) => {
						handlers.set(name, [...(handlers.get(name) ?? []), handler]);
					};
				}
				const value = Reflect.get(target, prop, receiver);
				return typeof value === "function" ? value.bind(target) : value;
			},
		});
		await mod.default(capture);
		if (!command) throw new Error("prose.ts registered no /prose command");
		return { mtimeMs, command, handlers };
	};

	let current = await instantiate(statSync(IMPL_PATH).mtimeMs);
	let pending: Promise<unknown> | undefined;

	// The first instance's hint wrapper is still installed on the editor; a
	// second one would stack on top of it with every reload.
	const replay = async (instance: Instance) => {
		if (!lastSessionEvent) return;
		const { name, event, ctx } = lastSessionEvent;
		const real = ctx as { ui: object };
		const ui = new Proxy(real.ui, {
			get(target, prop, receiver) {
				if (prop === "addAutocompleteProvider") return () => {};
				const value = Reflect.get(target, prop, receiver);
				return typeof value === "function" ? value.bind(target) : value;
			},
		});
		const replayCtx = new Proxy(real, {
			get(target, prop, receiver) {
				if (prop === "ui") return ui;
				const value = Reflect.get(target, prop, receiver);
				return typeof value === "function" ? value.bind(target) : value;
			},
		});
		for (const handler of instance.handlers.get(name) ?? []) await handler(event, replayCtx);
	};

	const swapIfChanged = async (): Promise<unknown> => {
		try {
			const mtimeMs = statSync(IMPL_PATH).mtimeMs;
			if (mtimeMs === current.mtimeMs) return undefined;
			const next = await instantiate(mtimeMs);
			await replay(next);
			current = next;
			return undefined;
		} catch (error) {
			return error;
		}
	};

	/** Swaps in the newer prose.ts; resolves to the load error, if any. */
	const refresh = (): Promise<unknown> => {
		// Cleared from .finally(), never inside swapIfChanged: when it settles
		// synchronously, an inner reset would run before this assignment.
		pending ??= swapIfChanged().finally(() => {
			pending = undefined;
		});
		return pending;
	};

	for (const name of current.handlers.keys()) {
		pi.on(name as Parameters<ExtensionAPI["on"]>[0], (async (event: unknown, ctx: unknown) => {
			if (REPLAYED_EVENTS.has(name)) lastSessionEvent = { name, event, ctx };
			let result: unknown;
			for (const handler of current.handlers.get(name) ?? []) {
				const value = await handler(event, ctx);
				if (value !== undefined) result = value;
			}
			return result;
		}) as never);
	}

	pi.registerCommand("prose", {
		...current.command,
		getArgumentCompletions: argumentPrefix => {
			void refresh();
			return current.command.getArgumentCompletions?.(argumentPrefix) ?? null;
		},
		handler: async (args, ctx) => {
			const error = await refresh();
			if (error !== undefined) {
				const reason = error instanceof Error ? error.message : String(error);
				ctx.ui.notify(`prose.ts failed to reload (${reason}); running the previous version.`, "warning");
			}
			return current.command.handler(args, ctx);
		},
	});
}
