import type { Link, LinkKind } from "../shared/links";

export interface ChatLinks {
  /** null until the first answer arrives. */
  links: Link[] | null;
  /** Links only the chat's sub-agents mentioned; null until a popover asked for them. */
  subagentLinks: Link[] | null;
  error: string | null;
}

export interface Loaded {
  links: Link[];
  subagentLinks?: Link[];
}

const NOTHING_YET: ChatLinks = { links: null, subagentLinks: null, error: null };

/**
 * Each chat's links as last fetched; one request per chat at a time, a refresh asked for meanwhile
 * runs after it. Sub-agent links are fetched only while a popover of that chat is open.
 */
export class LinksStore {
  private readonly chats = new Map<string, ChatLinks>();
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly again = new Set<string>();
  private readonly listeners = new Set<(agentId: string) => void>();
  /** Open popovers per chat. */
  private readonly watchers = new Map<string, number>();

  constructor(private readonly load: (agentId: string, subagents: boolean) => Promise<Loaded>) {}

  get(agentId: string): ChatLinks {
    return this.chats.get(agentId) ?? NOTHING_YET;
  }

  subscribe(listener: (agentId: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** While the returned function hasn't been called, refreshes of this chat include its sub-agents. */
  watchSubagents(agentId: string): () => void {
    this.watchers.set(agentId, (this.watchers.get(agentId) ?? 0) + 1);
    return () => {
      const left = (this.watchers.get(agentId) ?? 1) - 1;
      if (left) this.watchers.set(agentId, left);
      else this.watchers.delete(agentId);
    };
  }

  refresh(agentId: string): Promise<void> {
    const running = this.inFlight.get(agentId);
    if (running) {
      this.again.add(agentId);
      return running;
    }
    const run = (async () => {
      try {
        const loaded = await this.load(agentId, this.watchers.has(agentId));
        this.set(agentId, { links: loaded.links, subagentLinks: loaded.subagentLinks ?? this.get(agentId).subagentLinks, error: null });
      } catch (error) {
        this.set(agentId, { ...this.get(agentId), error: error instanceof Error ? error.message : String(error) });
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

/** Chip order in the popover. */
export const KIND_ORDER: readonly LinkKind[] = ["web", "image", "file"];

/** Each type present in `links`, in chip order, with its count. */
export function kindCounts(links: readonly Link[]): { kind: LinkKind; count: number }[] {
  return KIND_ORDER.map((kind) => ({ kind, count: links.filter((link) => link.kind === kind).length })).filter(
    (entry) => entry.count > 0,
  );
}

/**
 * The one type a chat's popover shows, like a tab: the user's pick in that chat while that type is
 * still present, else Web when the chat has web links, else its first type. Null without links.
 */
export function shownKind(links: readonly Link[], choice: LinkKind | undefined): LinkKind | null {
  const kinds = kindCounts(links).map((entry) => entry.kind);
  if (choice && kinds.includes(choice)) return choice;
  return kinds.includes("web") ? "web" : (kinds[0] ?? null);
}

/** Each chat's picked type, for this app session only. */
export const typeChoices = new Map<string, LinkKind>();

/** Chats whose popover shows sub-agent links, for this app session only. */
export const subagentChoices = new Set<string>();

/** The popover's rows before the type filter: the chat's links, plus its sub-agents' when shown, newest first. */
export function withSubagents(links: readonly Link[], subagentLinks: readonly Link[] | null, shown: boolean): readonly Link[] {
  if (!shown || !subagentLinks?.length) return links;
  return [...links, ...subagentLinks].sort((a, b) => b.lastAt - a.lastAt);
}

/** The muted column: `missing` for a path that is gone, the sub-agent for a sub-agent's link, else the host or folder. */
export function whereLabel(link: Link): string {
  const via = link.via ? `↳ ${link.via}` : "";
  if (link.missing) return via ? `missing · ${via}` : "missing";
  return via || link.where;
}
