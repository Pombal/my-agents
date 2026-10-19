import { Platform, Text } from "react-native";
import type { PluginAgentCommandContext, PluginClientContext, PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { noticeSchema, retitle } from "./shared/rpc";

function TitleNotice({ item, theme }: PluginTimelineItemProps<{ message: string; latencyMs: number }>) {
  return <Text accessibilityRole="status" style={{ color: theme.colors.foreground, paddingVertical: 8 }}>{item.data.message} · {(item.data.latencyMs / 1000).toFixed(1)}s</Text>;
}

export default function contribute(client: PluginClientContext) {
  let toast: HTMLElement | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const notify = (message: string) => {
    if (Platform.OS !== "web") return; // Native receives the durable timeline notice.
    toast?.remove(); clearTimeout(timer);
    toast = document.createElement("div");
    toast.setAttribute("role", "status"); toast.dataset.titlesNotice = "true";
    toast.textContent = message;
    Object.assign(toast.style, { position: "fixed", bottom: "28px", left: "50%", transform: "translateX(-50%)", zIndex: "2147483647", padding: "12px 18px", borderRadius: "8px", background: "#242424", color: "#fff", boxShadow: "0 4px 20px #0006", font: "14px system-ui", maxWidth: "85vw", pointerEvents: "none" });
    document.body.append(toast);
    timer = setTimeout(() => { toast?.remove(); toast = undefined; }, 6500);
  };
  const active = new Set<string>();
  const run = async (agentId: string) => {
    if (active.has(agentId)) return;
    active.add(agentId); notify("Checking this tab's title…");
    try { const result = await client.rpc(retitle, { agentId }); notify(`${result.message} · ${(result.latencyMs / 1000).toFixed(1)}s`); }
    catch (error) { notify(`Retitle failed: ${error instanceof Error ? error.message : String(error)}`); throw error; }
    finally { active.delete(agentId); }
  };
  const command = ({ agent }: PluginAgentCommandContext) => run(agent.id);
  const cleanups = [
    client.addTimelineRenderer({ kind: "title-result", version: 1, schema: noticeSchema, Component: TitleNotice }),
    // Command Center requires a built-in glyph; no tab/workspace icons are changed.
    client.addCommandCenterItem({ id: "retitle", title: "Retitle this tab", icon: "Type", keywords: ["title", "rename", "tab"], context: "agent", onSelect: command }),
    client.addSlashCommand({ name: "retitle", description: "Re-check this tab's title against the recent conversation", argumentHint: "", context: "agent", onSubmit: command }),
  ];
  if (Platform.OS === "web") {
    const selector = '[data-testid^="workspace-pane-"]';
    let lastPane: Element | null = null;
    const track = (event: Event) => { const pane = (event.target as Element)?.closest?.(selector); if (pane) lastPane = pane; };
    const keydown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || !event.altKey || event.metaKey || event.shiftKey || event.repeat || event.isComposing || event.getModifierState("AltGraph") || (event.code !== "KeyT" && event.key.toLowerCase() !== "t")) return;
      if (document.querySelector('[role="dialog"], [aria-modal="true"]')) return;
      const visible = [...document.querySelectorAll(selector)].filter(pane => { const rect = pane.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; });
      const focused = document.activeElement?.closest(selector);
      const pane = (focused && visible.includes(focused) ? focused : null) ?? (lastPane && visible.includes(lastPane) ? lastPane : null) ?? (visible.length === 1 ? visible[0] : null);
      const selected = pane?.querySelector('[data-testid^="workspace-tab-agent_"][aria-selected="true"]');
      const agentId = selected?.getAttribute("data-testid")?.slice("workspace-tab-agent_".length);
      if (!agentId) return;
      // Deliberately overrides non-Mac Paseo's theme-cycle shortcut for agent panes.
      event.preventDefault(); event.stopImmediatePropagation();
      void run(agentId).catch(() => {});
    };
    document.addEventListener("pointerdown", track, true);
    document.addEventListener("focusin", track, true);
    window.addEventListener("keydown", keydown, true);
    cleanups.push(() => { document.removeEventListener("pointerdown", track, true); document.removeEventListener("focusin", track, true); window.removeEventListener("keydown", keydown, true); });
  }
  return () => { cleanups.forEach(cleanup => cleanup()); toast?.remove(); clearTimeout(timer); };
}
