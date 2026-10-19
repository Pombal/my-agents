import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * The plugin SDK's PaseoApi (0.11.4) covers neither importing, unarchiving nor listing provider
 * sessions. The Paseo CLI installed next to the daemon's Node does, over the daemon's normal API,
 * so this plugin borrows it: the `paseo` binary for import/reload and the CLI's daemon client for
 * `fetch_recent_provider_sessions_request`.
 */
export function paseoBinary(): string {
  const sibling = path.join(path.dirname(process.execPath), "paseo");
  return existsSync(sibling) ? sibling : "paseo";
}

/** One entry of the daemon's `fetch_recent_provider_sessions_response`. */
export interface RecentProviderSession {
  providerId: string;
  providerHandleId: string;
  cwd: string;
  title: string | null;
  firstPromptPreview: string | null;
  lastActivityAt: string;
}

/** The subset of the CLI's `DaemonClient` this plugin calls. */
export interface RecentSessionsClient {
  fetchRecentProviderSessions(options: { providers: string[]; limit: number; cwd?: string }): Promise<{
    entries: RecentProviderSession[];
    providerErrors?: { provider: string; message: string }[];
  }>;
  close(): Promise<void>;
}

interface CliModules {
  connectToDaemon(options: { target: unknown }): Promise<RecentSessionsClient>;
  selectDaemonTarget(options: object, env: NodeJS.ProcessEnv, localOnly: boolean): unknown;
}

let modules: Promise<CliModules> | null = null;

/** Loads `dist/utils/{client,daemon-target}.js` from the CLI package that owns `paseoBinary()`. */
function cliModules(): Promise<CliModules> {
  modules ??= (async () => {
    // bin/paseo is a symlink into <package>/bin/paseo.
    const root = path.dirname(path.dirname(realpathSync(paseoBinary())));
    const load = (file: string) => import(pathToFileURL(path.join(root, "dist", "utils", file)).href);
    const [client, target] = await Promise.all([load("client.js"), load("daemon-target.js")]);
    if (typeof client.connectToDaemon !== "function" || typeof target.selectDaemonTarget !== "function") {
      throw new Error(`Paseo CLI at ${root} has an unexpected layout`);
    }
    return { connectToDaemon: client.connectToDaemon, selectDaemonTarget: target.selectDaemonTarget };
  })();
  modules.catch(() => {
    modules = null;
  });
  return modules;
}

/** A short-lived connection to the local daemon, closed after `use`. */
export async function withDaemonClient<T>(use: (client: RecentSessionsClient) => Promise<T>): Promise<T> {
  const { connectToDaemon, selectDaemonTarget } = await cliModules();
  const client = await connectToDaemon({ target: selectDaemonTarget({}, process.env, true) });
  try {
    return await use(client);
  } finally {
    await client.close().catch(() => undefined);
  }
}
