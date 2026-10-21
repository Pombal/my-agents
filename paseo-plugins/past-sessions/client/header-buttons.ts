import type { PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";

/**
 * An icon-only History button in every workspace header that opens the Past sessions panel in
 * the explorer sidebar, next to the chat. Header buttons are registered per workspace, so this
 * follows Paseo's workspace directory and adds or removes buttons as workspaces come and go.
 */
export function startHeaderButtons(client: PluginClientContext, panelId: string): () => void {
  const buttons = new Map<string, PluginButtonRegistration>();

  const add = (workspaceId: string) => {
    if (buttons.has(workspaceId)) return;
    try {
      buttons.set(
        workspaceId,
        client.addHeaderButton({
          id: "past-sessions",
          workspaceId,
          button: {
            title: "Past sessions",
            icon: "History",
            behavior: { kind: "action", onPress: () => client.openPanel(panelId, { workspaceId, location: "explorer" }) },
          },
        }),
      );
    } catch (error) {
      console.warn("[past-sessions] header button failed", error);
    }
  };
  const remove = (workspaceId: string) => {
    buttons.get(workspaceId)?.remove();
    buttons.delete(workspaceId);
  };
  const replace = (ids: ReadonlySet<string>) => {
    for (const id of [...buttons.keys()]) if (!ids.has(id)) remove(id);
    for (const id of ids) add(id);
  };

  const lifetime = new AbortController();
  const load = async () => {
    const first = await client.paseo.workspaces.list({ subscribe: {} });
    const ids = new Set(first.entries.map((workspace) => workspace.id));
    // The daemon pages at 200; follow the cursor so every workspace gets its button.
    let pageInfo = first.pageInfo;
    while (pageInfo.hasMore && pageInfo.nextCursor && !lifetime.signal.aborted) {
      const page = await client.paseo.workspaces.list({ page: { limit: 200, cursor: pageInfo.nextCursor } });
      for (const workspace of page.entries) ids.add(workspace.id);
      pageInfo = page.pageInfo;
    }
    if (lifetime.signal.aborted) {
      void first.subscription.release();
      return;
    }
    replace(ids);
    first.subscription.subscribe({
      snapshot: (snapshot) => replace(new Set(snapshot.entries.map((workspace) => workspace.id))),
      update: (message) => {
        if (message.type !== "workspace_update") return;
        const update = message.payload;
        if (update.kind === "upsert") add(update.workspace.id);
        else remove(update.id);
      },
    });
    lifetime.signal.addEventListener("abort", () => void first.subscription.release());
  };
  void load().catch((error: unknown) => {
    if (!lifetime.signal.aborted) console.warn("[past-sessions] workspace subscription failed", error);
  });

  return () => {
    lifetime.abort();
    for (const id of [...buttons.keys()]) remove(id);
  };
}
