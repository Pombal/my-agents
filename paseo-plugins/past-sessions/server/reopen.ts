import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { reopenPastSession } from "../shared/rpc";

/**
 * The plugin SDK's PaseoApi (0.11.4) has no import or unarchive call, so reopening goes
 * through the Paseo CLI next to the daemon. It talks to the same daemon over its normal API:
 * `paseo agent reload` → `refreshAgent` (unarchives and loads an archived agent),
 * `paseo import` → `importAgent` (the provider session becomes a Paseo agent).
 */
function paseoBinary(): string {
  const sibling = path.join(path.dirname(process.execPath), "paseo");
  return existsSync(sibling) ? sibling : "paseo";
}

async function runPaseo(args: string[]): Promise<unknown> {
  let stdout: string;
  try {
    ({ stdout } = await promisify(execFile)(paseoBinary(), [...args, "--json"], {
      timeout: 120_000,
      maxBuffer: 4 * 1024 * 1024,
    }));
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string };
    const detail = `${failure.stdout ?? ""}\n${failure.stderr ?? ""}`.trim();
    throw new Error(detail ? `${failure.message}: ${detail}` : failure.message);
  }
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(`Unexpected paseo output: ${stdout.slice(0, 500)}`);
  }
}

function agentIdOf(result: unknown): string {
  const record = Array.isArray(result) ? result[0] : result;
  const agentId = record && typeof record === "object" ? (record as Record<string, unknown>).agentId : null;
  if (typeof agentId !== "string" || !agentId) {
    throw new Error(`paseo returned no agentId: ${JSON.stringify(result).slice(0, 500)}`);
  }
  return agentId;
}

export async function reopenHandler(
  input: RpcInput<typeof reopenPastSession>,
): Promise<RpcOutput<typeof reopenPastSession>> {
  if (input.source === "paseo") {
    return { agentId: agentIdOf(await runPaseo(["agent", "reload", input.agentId])) };
  }
  return {
    agentId: agentIdOf(
      await runPaseo(["import", "--provider", input.provider, "--cwd", input.cwd, input.file]),
    ),
  };
}
