import type { PaseoApi } from "@getpaseo/client";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { findTranscript, readClaudeSubagentLine, readOmpLine, type Transcript } from "./transcripts";

export interface SubagentTranscript extends Omit<Transcript, "kind"> {
  /** Shown as `↳ <name>` on its rows. */
  name: string;
}

const PARENT_LABEL = "paseo.parent-agent-id";

/**
 * OMP task sub-agents: `<session file minus .jsonl>/<Name>.jsonl`; theirs nest as
 * `<Name>/<Name>.<Child>.jsonl`; advisors are `__advisor.<id>.jsonl`.
 */
async function ompSubagents(folder: string): Promise<SubagentTranscript[]> {
  let entries;
  try {
    entries = await readdir(folder, { withFileTypes: true });
  } catch {
    return [];
  }
  const found: SubagentTranscript[] = [];
  const prefix = `${path.basename(folder)}.`;
  for (const entry of entries) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) found.push(...(await ompSubagents(file)));
    else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      const stem = entry.name.slice(0, -".jsonl".length);
      const name = (stem.startsWith(prefix) ? stem.slice(prefix.length) : stem).replace(/^_+/, "");
      found.push({ file, name, read: readOmpLine });
    }
  }
  return found;
}

/** `agent-<id>.meta.json` never changes once written. */
const claudeNames = new Map<string, string>();

/** Claude Code sub-agents: `<session file minus .jsonl>/subagents/agent-<id>.jsonl`, named by the task description in its `.meta.json`. */
async function claudeSubagents(folder: string): Promise<SubagentTranscript[]> {
  let names: string[];
  try {
    names = await readdir(folder);
  } catch {
    return [];
  }
  const found: SubagentTranscript[] = [];
  for (const entry of names) {
    if (!entry.endsWith(".jsonl")) continue;
    const file = path.join(folder, entry);
    let name = claudeNames.get(file);
    if (!name) {
      try {
        const meta = JSON.parse(await readFile(file.replace(/\.jsonl$/, ".meta.json"), "utf8")) as { description?: unknown; agentType?: unknown };
        name = typeof meta.description === "string" && meta.description ? meta.description : typeof meta.agentType === "string" ? meta.agentType : "";
      } catch {
        name = "";
      }
      name ||= "subagent";
      claudeNames.set(file, name);
    }
    found.push({ file, name, read: readClaudeSubagentLine });
  }
  return found;
}

/** Paseo child agents (label `paseo.parent-agent-id`), archived ones included, read from their own transcripts. */
async function paseoChildren(agentId: string, paseo: PaseoApi, home: string): Promise<SubagentTranscript[]> {
  const { entries } = await paseo.agents.list({ filter: { labels: { [PARENT_LABEL]: agentId }, includeArchived: true }, page: { limit: 200 } });
  const found = await Promise.all(
    entries.map(async ({ agent }) => {
      const transcript = await findTranscript(agent, home);
      return transcript ? { file: transcript.file, read: transcript.read, name: agent.title || agent.id.slice(0, 8) } : null;
    }),
  );
  return found.filter((child) => child !== null);
}

/** Every sub-agent transcript of a chat: its harness's own sub-agents plus its Paseo children. */
export async function findSubagents(agentId: string, transcript: Transcript | null, paseo: PaseoApi, home: string): Promise<SubagentTranscript[]> {
  const folder = transcript?.file.replace(/\.jsonl$/, "");
  const [own, children] = await Promise.all([
    !folder ? [] : transcript?.kind === "omp" ? ompSubagents(folder) : transcript?.kind === "claude" ? claudeSubagents(path.join(folder, "subagents")) : [],
    paseoChildren(agentId, paseo, home),
  ]);
  return [...own, ...children];
}
