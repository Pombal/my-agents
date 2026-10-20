import { execFile } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { parseDecision } from "../shared/agent-titles.mjs";
import { PROMPTS, WORKSPACE_PROMPTS, type TitleSituation, type WorkspaceSituation } from "./prompts";

const TIMEOUT_MS = 20_000;

// What Claude sees besides the conversation: the workspace's other tabs, "title"
// for the every-reply check, "rejected" for a manual retitle.
export type Sibling = string | { title: string; note: string };
export type TitleRequest = { workspace: string; siblings: Sibling[]; conversation: string; title?: string; rejected?: string[] };

// For a workspace: this project's other workspaces (marked like sibling tabs) and
// the most recently active ones of other projects; "tabs" and "rejected" for a manual retitle.
export type WorkspaceTitleRequest = { projectName: string; project: Sibling[]; elsewhere: { title: string; project: string }[]; conversation: string; tabs?: string[]; rejected?: string[] };

export const decideTitle = (situation: TitleSituation, request: TitleRequest) => askHaiku(PROMPTS[situation], request);
export const decideWorkspaceTitle = (situation: WorkspaceSituation, request: WorkspaceTitleRequest) => askHaiku(WORKSPACE_PROMPTS[situation], request);

// Claude Haiku through Stefan's Claude Code subscription login: no tools, MCP,
// customizations or saved session, and never an inherited API key or 3P routing.
async function askHaiku(systemPrompt: string, request: object) {
  const env = { ...process.env };
  // Service-launched daemons may omit Claude's native install directory from PATH.
  const nativeBin = join(homedir(), ".local", "bin");
  const path = (env.PATH ?? "").split(delimiter);
  if (!path.includes(nativeBin)) env.PATH = [...path, nativeBin].join(delimiter);
  for (const key of Object.keys(env)) {
    if (/^(ANTHROPIC_|CLAUDE_CODE_USE_|CLAUDECODE$|CLAUDE_CODE_OAUTH_TOKEN$)/.test(key)) delete env[key];
  }
  const args = ["-p", "--model", "haiku", "--safe-mode", "--no-session-persistence", "--tools", "", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--system-prompt", systemPrompt, "--output-format", "text"];
  const stdout = await new Promise<string>((resolve, reject) => {
    const child = execFile("claude", args, { cwd: tmpdir(), env, timeout: TIMEOUT_MS, maxBuffer: 64 * 1024 }, (error, stdout, stderr) => {
      if (!error) return resolve(stdout);
      const cause = error as NodeJS.ErrnoException & { killed?: boolean };
      if (cause.code === "ENOENT") reject(new Error("Claude CLI not found on the daemon's PATH"));
      else if (cause.killed) reject(new Error(`Claude took longer than ${TIMEOUT_MS / 1000} s`));
      else reject(new Error(`Claude CLI failed: ${(stderr.trim() || stdout.trim() || error.message).split("\n")[0].slice(0, 160)}`));
    });
    child.stdin?.end(JSON.stringify(request));
  });
  return parseDecision(stdout);
}
