import type { Link } from "../shared/links";
import { readShowFiles, writeShowFiles } from "./web";

export interface ChatLinks {
  /** null until the first answer arrives. */
  links: Link[] | null;
  error: string | null;
}

const NOTHING_YET: ChatLinks = { links: null, error: null };

/** Each chat's links as last fetched; one request per chat at a time, a refresh asked for meanwhile runs after it. */
export class LinksStore {
  private readonly chats = new Map<string, ChatLinks>();
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly again = new Set<string>();
  private readonly listeners = new Set<(agentId: string) => void>();

  constructor(private readonly load: (agentId: string) => Promise<Link[]>) {}

  get(agentId: string): ChatLinks {
    return this.chats.get(agentId) ?? NOTHING_YET;
  }

  subscribe(listener: (agentId: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  refresh(agentId: string): Promise<void> {
    const running = this.inFlight.get(agentId);
    if (running) {
      this.again.add(agentId);
      return running;
    }
    const run = (async () => {
      try {
        this.set(agentId, { links: await this.load(agentId), error: null });
      } catch (error) {
        this.set(agentId, { links: this.get(agentId).links, error: error instanceof Error ? error.message : String(error) });
      } finally {
        this.inFlight.delete(agentId);
        if (this.again.delete(agentId)) void this.refresh(agentId);
      }
    })();
    this.inFlight.set(agentId, run);
    return run;
  }

  forget(agentId: string): void {
    this.chats.delete(agentId);
  }

  private set(agentId: string, chat: ChatLinks): void {
    this.chats.set(agentId, chat);
    for (const listener of this.listeners) listener(agentId);
  }
}

/** Web links and images: what the pill counts and the popover shows by default. */
export function countShown(links: readonly Link[]): number {
  return links.filter((link) => link.kind !== "file").length;
}

let showFiles = readShowFiles();
const showFilesListeners = new Set<() => void>();

/** The popover's "+N files" toggle, remembered per browser. */
export const filesToggle = {
  get: (): boolean => showFiles,
  set(show: boolean): void {
    showFiles = show;
    writeShowFiles(show);
    for (const listener of showFilesListeners) listener();
  },
  subscribe(listener: () => void): () => void {
    showFilesListeners.add(listener);
    return () => showFilesListeners.delete(listener);
  },
};
