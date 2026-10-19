import type { PastSession } from "../shared/rpc";
import type { OmpSession } from "./omp-sessions";
import { isSameOrInside } from "./slug";

export interface AgentRecord {
  id: string;
  title: string | null;
  /** Resolved (realpath) cwd. */
  cwd: string;
  provider: string;
  workspaceId: string | null;
  projectKey: string | null;
  archivedAt: string | null;
  updatedAt: string;
  lastUserMessageAt: string | null;
  /** Provider session ids and native handles (OMP: session id and/or .jsonl path). */
  sessionRefs: string[];
}

export interface ScopeFilter {
  /** Resolved folders; with `includeSubfolders` anything below them matches too. */
  targets: string[];
  includeSubfolders: boolean;
  workspaceIds: string[];
  /** Project scope only: agents placed in this project match wherever their cwd is. */
  projectKey: string | null;
}

export function agentInScope(agent: AgentRecord, scope: ScopeFilter): boolean {
  if (agent.workspaceId && scope.workspaceIds.includes(agent.workspaceId)) return true;
  if (scope.projectKey && agent.projectKey === scope.projectKey) return true;
  return scope.includeSubfolders
    ? scope.targets.some((target) => isSameOrInside(target, agent.cwd))
    : scope.targets.includes(agent.cwd);
}

const TITLE_MAX = 120;
const LONE_TAG = /^<\/?[\w-]+>$/;

/** First meaningful prompt line; wrapper lines such as `<chat-history-summary>` are skipped. */
export function titleFromPrompt(prompt: string | null): string | null {
  const line = prompt
    ?.split("\n")
    .map((part) => part.trim())
    .find((part) => part.length > 0 && !LONE_TAG.test(part));
  if (!line) return null;
  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1)}…` : line;
}

/**
 * Archived Paseo agents in scope, plus OMP sessions no Paseo agent (live or archived,
 * any folder) has opened. An OMP session is "known" when an agent's session refs contain
 * its id or its file path. Newest activity first.
 */
export function mergePastSessions(input: {
  agents: AgentRecord[];
  ompSessions: OmpSession[];
  scope: ScopeFilter;
}): { entries: PastSession[]; hiddenKnownToPaseo: number } {
  const known = new Set(input.agents.flatMap((agent) => agent.sessionRefs));
  const ompByRef = new Map<string, OmpSession>();
  for (const session of input.ompSessions) {
    ompByRef.set(session.sessionId, session);
    ompByRef.set(session.file, session);
  }

  const entries: PastSession[] = [];
  for (const agent of input.agents) {
    if (!agent.archivedAt || !agentInScope(agent, input.scope)) continue;
    const session = agent.sessionRefs.map((ref) => ompByRef.get(ref)).find(Boolean);
    entries.push({
      key: `paseo:${agent.id}`,
      source: "paseo",
      title:
        agent.title?.trim() ||
        session?.title ||
        titleFromPrompt(session?.firstPrompt ?? null) ||
        "Untitled agent",
      cwd: agent.cwd,
      at: session?.mtime ?? agent.lastUserMessageAt ?? agent.updatedAt,
      provider: agent.provider,
      agentId: agent.id,
    });
  }

  let hiddenKnownToPaseo = 0;
  const newestOmp = new Map<string, OmpSession>();
  for (const session of input.ompSessions) {
    if (known.has(session.sessionId) || known.has(session.file)) {
      hiddenKnownToPaseo += 1;
      continue;
    }
    const previous = newestOmp.get(session.sessionId);
    if (!previous || previous.mtime < session.mtime) newestOmp.set(session.sessionId, session);
  }
  for (const session of newestOmp.values()) {
    entries.push({
      key: `omp:${session.sessionId}`,
      source: "omp",
      title: session.title || titleFromPrompt(session.firstPrompt) || "Empty session",
      cwd: session.cwd,
      at: session.mtime,
      provider: session.provider,
      sessionId: session.sessionId,
      file: session.file,
    });
  }

  entries.sort((a, b) => (a.at === b.at ? a.key.localeCompare(b.key) : a.at < b.at ? 1 : -1));
  return { entries, hiddenKnownToPaseo };
}
