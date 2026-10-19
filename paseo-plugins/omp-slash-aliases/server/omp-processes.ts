import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/** A live process as far as /btw readiness cares. */
export interface ProcessInfo {
  pid: number;
  argv: string[];
  env: Record<string, string>;
}

function splitNul(text: string): string[] {
  return text.split("\0").filter(Boolean);
}

/** Processes of this user readable under `procRoot` (Linux /proc). */
export async function listProcesses(procRoot = "/proc"): Promise<ProcessInfo[]> {
  const processes: ProcessInfo[] = [];
  for (const name of await readdir(procRoot)) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const [cmdline, environ] = await Promise.all([
        readFile(join(procRoot, name, "cmdline"), "utf8"),
        readFile(join(procRoot, name, "environ"), "utf8"),
      ]);
      const env: Record<string, string> = {};
      for (const pair of splitNul(environ)) {
        const at = pair.indexOf("=");
        if (at > 0) env[pair.slice(0, at)] = pair.slice(at + 1);
      }
      processes.push({ pid: Number(name), argv: splitNul(cmdline), env });
    } catch {
      // Exited meanwhile, or another user's process.
    }
  }
  return processes;
}

/** Paseo's OMP host for this chat: `omp --mode rpc-ui …` with the chat's PASEO_AGENT_ID. */
export function isOmpRpcHost(info: ProcessInfo, agentId: string): boolean {
  const [command = "", ...args] = info.argv;
  return (
    info.env.PASEO_AGENT_ID === agentId &&
    /(^|\/)omp$/.test(command) &&
    args.some(arg => /^(--mode=)?rpc(-ui)?$/.test(arg))
  );
}

/**
 * Whether sending `/follow-up /btw …` to this chat reaches the /btw handler.
 * No live OMP host: Paseo starts one with the current extension, so yes.
 * A live host without the extension's marker started before /btw existed; its
 * question would reach the model as an ordinary message.
 */
export function btwReady(processes: ProcessInfo[], agentId: string, markedPids: ReadonlySet<number>): boolean {
  return processes.filter(info => isOmpRpcHost(info, agentId)).every(info => markedPids.has(info.pid));
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
