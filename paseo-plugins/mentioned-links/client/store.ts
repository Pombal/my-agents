import type { Link, LinkKind } from "../shared/links";

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

/** A type to show alone, or every link. */
export type TypeFilter = LinkKind | "all";

/** Chip order in the popover. */
export const KIND_ORDER: readonly LinkKind[] = ["web", "image", "file"];

/** Each type present in `links`, in chip order, with its count. */
export function kindCounts(links: readonly Link[]): { kind: LinkKind; count: number }[] {
  return KIND_ORDER.map((kind) => ({ kind, count: links.filter((link) => link.kind === kind).length })).filter(
    (entry) => entry.count > 0,
  );
}

/**
 * The filter a chat's popover uses: the user's last choice in that chat if its type is still
 * present, else Web alone when the chat has web links and something else, else everything.
 */
export function effectiveFilter(links: readonly Link[], choice: TypeFilter | undefined): TypeFilter {
  const kinds = kindCounts(links).map((entry) => entry.kind);
  if (kinds.length < 2) return "all";
  if (choice && (choice === "all" || kinds.includes(choice))) return choice;
  return kinds.includes("web") ? "web" : "all";
}

/** Each chat's chosen type, for this app session only. */
export const typeChoices = new Map<string, TypeFilter>();
