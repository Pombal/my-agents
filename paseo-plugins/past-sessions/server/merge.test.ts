import { describe, expect, it } from "vitest";
import { mergePastSessions, titleFromPrompt, type AgentRecord, type ScopeFilter } from "./merge";
import type { OmpSession } from "./omp-sessions";

const folder = "/home/cx/agentspace/index";
const folderScope: ScopeFilter = { targets: [folder], includeSubfolders: false, workspaceIds: ["wks_index"], projectKey: null };

function agent(overrides: Partial<AgentRecord> & { id: string }): AgentRecord {
  return {
    title: null,
    cwd: folder,
    provider: "omp",
    workspaceId: "wks_index",
    projectKey: "proj_index",
    archivedAt: null,
    updatedAt: "2026-10-01T00:00:00.000Z",
    lastUserMessageAt: null,
    sessionRefs: [],
    ...overrides,
  };
}

function omp(overrides: Partial<OmpSession> & { sessionId: string }): OmpSession {
  return {
    cwd: folder,
    createdAt: null,
    title: null,
    firstPrompt: null,
    file: `/home/cx/.omp/agent/sessions/-agentspace-index/x_${overrides.sessionId}.jsonl`,
    provider: "omp",
    mtime: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("mergePastSessions", () => {
  it("hides OMP sessions any Paseo agent already owns, by session id or by file path", () => {
    const result = mergePastSessions({
      agents: [
        agent({ id: "live", sessionRefs: ["s-live"] }),
        agent({ id: "archived", archivedAt: "2026-10-02T00:00:00.000Z", sessionRefs: ["s-archived"] }),
        agent({ id: "imported", cwd: "/elsewhere", workspaceId: "wks_other", sessionRefs: ["/f/by-path.jsonl"] }),
      ],
      ompSessions: [
        omp({ sessionId: "s-live" }),
        omp({ sessionId: "s-archived" }),
        omp({ sessionId: "s-path", file: "/f/by-path.jsonl" }),
        omp({ sessionId: "s-only", firstPrompt: "Fresh terminal session" }),
      ],
      scope: folderScope,
    });
    expect(result.entries.map((entry) => entry.key).sort()).toEqual(["omp:s-only", "paseo:archived"]);
    expect(result.hiddenKnownToPaseo).toBe(3);
  });

  it("lists a session found in two session folders once, with its newest copy", () => {
    const result = mergePastSessions({
      agents: [],
      ompSessions: [
        omp({ sessionId: "dup", file: "/old/x_dup.jsonl", mtime: "2026-09-01T00:00:00.000Z" }),
        omp({ sessionId: "dup", file: "/new/x_dup.jsonl", mtime: "2026-10-01T00:00:00.000Z" }),
      ],
      scope: folderScope,
    });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.file).toBe("/new/x_dup.jsonl");
  });

  it("sorts newest activity first across both sources", () => {
    const result = mergePastSessions({
      agents: [
        agent({ id: "a-old", archivedAt: "x", lastUserMessageAt: "2026-09-01T00:00:00.000Z" }),
        agent({ id: "a-new", archivedAt: "x", lastUserMessageAt: "2026-10-03T00:00:00.000Z" }),
      ],
      ompSessions: [omp({ sessionId: "o-mid", mtime: "2026-10-02T00:00:00.000Z" })],
      scope: folderScope,
    });
    expect(result.entries.map((entry) => entry.key)).toEqual(["paseo:a-new", "omp:o-mid", "paseo:a-old"]);
  });

  it("dates and titles an archived agent from its OMP file when it has no title", () => {
    const result = mergePastSessions({
      agents: [
        agent({ id: "a", archivedAt: "x", updatedAt: "2026-10-09T00:00:00.000Z", sessionRefs: ["s1"] }),
      ],
      ompSessions: [omp({ sessionId: "s1", firstPrompt: "Fix the build\nmore", mtime: "2026-10-05T00:00:00.000Z" })],
      scope: folderScope,
    });
    expect(result.entries).toEqual([
      expect.objectContaining({ key: "paseo:a", title: "Fix the build", at: "2026-10-05T00:00:00.000Z" }),
    ]);
  });

  it("limits folder scope to the folder's agents and widens project scope to subfolders and project agents", () => {
    // OMP sessions arrive already filtered by OmpSessionIndex; only agents are scoped here.
    const agents = [
      agent({ id: "sub", archivedAt: "x", cwd: `${folder}/.scratch`, workspaceId: null }),
      agent({ id: "worktree", archivedAt: "x", cwd: "/home/cx/.paseo/worktrees/abc", workspaceId: "wks_gone" }),
    ];
    const inFolder = mergePastSessions({ agents, ompSessions: [], scope: folderScope });
    expect(inFolder.entries).toEqual([]);

    const inProject = mergePastSessions({
      agents,
      ompSessions: [],
      scope: { targets: [folder], includeSubfolders: true, workspaceIds: ["wks_index"], projectKey: "proj_index" },
    });
    expect(inProject.entries.map((entry) => entry.key).sort()).toEqual(["paseo:sub", "paseo:worktree"]);
  });
});

describe("titleFromPrompt", () => {
  it("skips blank lines and wrapper tags", () => {
    expect(titleFromPrompt("\n<chat-history-summary>\nChat history from a previous Paseo agent.")).toBe(
      "Chat history from a previous Paseo agent.",
    );
  });

  it("caps long lines", () => {
    expect(titleFromPrompt("a".repeat(500))).toHaveLength(120);
  });
});
