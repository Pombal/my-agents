import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { execFile } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { listPastSessions } from "../shared/rpc";
import { mergePastSessions, type AgentRecord } from "./merge";
import { OmpSessionIndex, resolvedOrSelf, type OmpSessionRoot } from "./omp-sessions";

type Paseo = PluginHandlerContext["paseo"];

/**
 * Session folders for every enabled OMP-based Paseo provider: the built-in `omp` provider
 * reads `~/.omp/agent/sessions`; a provider that extends `omp` with `OMP_PROFILE=<name>`
 * reads `~/.omp/profiles/<name>/agent/sessions`. The first provider per folder imports it.
 */
export function sessionRootsFromProviders(providers: Record<string, unknown>, home: string): OmpSessionRoot[] {
  const roots: OmpSessionRoot[] = [];
  const seen = new Set<string>();
  const ids = ["omp", ...Object.keys(providers).filter((id) => id !== "omp").sort()];
  for (const id of ids) {
    const raw = providers[id];
    const entry = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    if (id !== "omp" && entry.extends !== "omp") continue;
    if (entry.enabled === false) continue;
    const env = entry.env && typeof entry.env === "object" ? (entry.env as Record<string, unknown>) : {};
    const profile = typeof env.OMP_PROFILE === "string" ? env.OMP_PROFILE.trim() : "";
    const dir =
      profile && profile !== "default"
        ? path.join(home, ".omp", "profiles", profile, "agent", "sessions")
        : path.join(home, ".omp", "agent", "sessions");
    if (seen.has(dir)) continue;
    seen.add(dir);
    roots.push({ dir, provider: id });
  }
  return roots;
}

let index: Promise<OmpSessionIndex> | null = null;
async function sessionIndex(): Promise<OmpSessionIndex> {
  index ??= Promise.all([resolvedOrSelf(homedir()), resolvedOrSelf(tmpdir())]).then(
    ([home, tmp]) => new OmpSessionIndex({ home, tmp }),
  );
  return index;
}

async function listAllWorkspaces(paseo: Paseo) {
  const all = [];
  let cursor: string | undefined;
  do {
    const page = await paseo.workspaces.list({ page: { limit: 200, ...(cursor ? { cursor } : {}) } });
    all.push(...page.entries);
    cursor = page.pageInfo.hasMore ? (page.pageInfo.nextCursor ?? undefined) : undefined;
  } while (cursor);
  return all;
}

async function listAllAgents(paseo: Paseo) {
  const all = [];
  let cursor: string | undefined;
  do {
    const page = await paseo.agents.list({
      filter: { includeArchived: true },
      page: { limit: 200, ...(cursor ? { cursor } : {}) },
    });
    all.push(...page.entries);
    cursor = page.pageInfo.hasMore ? (page.pageInfo.nextCursor ?? undefined) : undefined;
  } while (cursor);
  return all;
}

/** Every checkout of a git repo (Paseo, herdr and hand-made worktrees); [] when not a repo. */
async function gitWorktrees(repo: string, warnings: string[]): Promise<string[]> {
  try {
    const { stdout } = await promisify(execFile)("git", ["-C", repo, "worktree", "list", "--porcelain"], {
      timeout: 5_000,
    });
    return stdout
      .split("\n")
      .filter((row) => row.startsWith("worktree "))
      .map((row) => row.slice("worktree ".length));
  } catch (error) {
    warnings.push(`git worktree list failed for ${repo}: ${String(error)}`);
    return [];
  }
}

export async function listHandler(
  input: RpcInput<typeof listPastSessions>,
  { paseo }: PluginHandlerContext,
): Promise<RpcOutput<typeof listPastSessions>> {
  const started = performance.now();
  const warnings: string[] = [];
  const [workspaces, projects, agentEntries, config] = await Promise.all([
    listAllWorkspaces(paseo),
    paseo.projects.list(),
    listAllAgents(paseo),
    paseo.config.get().catch((error: unknown) => {
      warnings.push(`Daemon config unavailable, using ~/.omp/agent/sessions only: ${String(error)}`);
      return null;
    }),
  ]);
  const workspace = workspaces.find((candidate) => candidate.id === input.workspaceId);
  if (!workspace) throw new Error(`Workspace ${input.workspaceId} not found`);
  const folder = workspace.workspaceDirectory ?? workspace.projectRootPath;
  const projectWorkspaces = workspaces.filter((candidate) => candidate.projectId === workspace.projectId);
  const projectKey = projects.projects.find((project) => project.projectId === workspace.projectId)?.projectKey ?? null;
  const includeSubfolders = input.scope === "project";
  const rawTargets = includeSubfolders
    ? [
        workspace.projectRootPath,
        ...projectWorkspaces.map((candidate) => candidate.workspaceDirectory ?? ""),
        ...(workspace.projectKind === "git" ? await gitWorktrees(workspace.projectRootPath, warnings) : []),
      ]
    : [folder];
  const targets = [...new Set(await Promise.all(rawTargets.filter(Boolean).map(resolvedOrSelf)))];

  const home = homedir();
  const providers: Record<string, unknown> = config?.config.providers ?? {};
  const { sessions, stats } = await (await sessionIndex()).list({
    sessionRoots: sessionRootsFromProviders(providers, home),
    targets,
    includeSubfolders,
  });

  const agents: AgentRecord[] = await Promise.all(
    agentEntries.map(async ({ agent, project }) => ({
      id: agent.id,
      title: agent.title,
      cwd: await resolvedOrSelf(agent.cwd),
      provider: agent.provider,
      workspaceId: agent.workspaceId ?? null,
      projectKey: project?.projectKey ?? null,
      archivedAt: agent.archivedAt ?? null,
      updatedAt: agent.updatedAt,
      lastUserMessageAt: agent.lastUserMessageAt,
      sessionRefs: [
        agent.persistence?.sessionId,
        agent.persistence?.nativeHandle,
        agent.runtimeInfo?.sessionId,
      ].filter((ref): ref is string => typeof ref === "string" && ref.length > 0),
    })),
  );

  const { entries, sameFolder, hiddenKnownToPaseo } = mergePastSessions({
    agents,
    ompSessions: sessions,
    scope: {
      mode: input.scope,
      targets,
      workspaceIds: includeSubfolders ? projectWorkspaces.map((candidate) => candidate.id) : [workspace.id],
      projectKey: includeSubfolders ? projectKey : null,
    },
  });

  return {
    workspaceName: workspace.name,
    home,
    folder,
    projectRoot: workspace.projectRootPath,
    projectName: workspace.projectDisplayName,
    scope: input.scope,
    entries,
    sameFolder,
    stats: {
      elapsedMs: Math.round(performance.now() - started),
      ompDirsScanned: stats.dirsScanned,
      ompFilesSeen: stats.filesSeen,
      ompFilesRead: stats.filesRead,
      hiddenKnownToPaseo,
    },
    warnings,
  };
}
