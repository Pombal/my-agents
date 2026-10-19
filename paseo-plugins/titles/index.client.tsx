import { ActivityIndicator, Platform } from "react-native";
import type { PluginButtonIconProps, PluginClientContext } from "@getpaseo/plugin/client";
import { useToast, type ToastApi, type ToastVariant } from "@getpaseo/plugin/client/react-native";
import { retitle } from "./shared/rpc";

const TAB = '[data-testid^="workspace-tab-agent_"][aria-selected="true"]';
const PANE = '[data-testid^="workspace-pane-"]';

export default function contribute(client: PluginClientContext) {
  const running = new Set<string>();

  // Feedback never enters the conversation. While Claude thinks, the agent's
  // composer shows a "Retitling…" pill; the outcome is a Paseo toast. Toasts
  // are a hook-only API, so the pill's own spinner component lends us one.
  const run = async (agentId: string, workspaceId: string, note = "") => {
    if (running.has(agentId)) return;
    running.add(agentId);
    const lent: { toast?: ToastApi } = {};
    const Spinner = ({ size, color }: PluginButtonIconProps) => {
      lent.toast = useToast();
      return <ActivityIndicator size={size} color={color} />;
    };
    const pill = client.addComposerPill({
      id: `retitling-${agentId}`, workspaceId, agentId,
      button: { title: "Retitling…", icon: Spinner, disabled: true, behavior: { kind: "action", onPress() {} } },
    });
    let feedback: { text: string; variant: ToastVariant };
    try {
      const result = await client.rpc(retitle, { agentId });
      feedback = result.outcome === "renamed" ? { text: `Renamed to ${result.title}`, variant: "success" }
        : result.outcome === "kept" ? { text: `“${result.title}” still fits`, variant: "info" }
        : result.outcome === "unclear" ? { text: "No clear subject yet; title unchanged", variant: "info" }
        : { text: `Couldn't retitle: ${result.message}`, variant: "error" };
    } catch (error) {
      feedback = { text: `Couldn't retitle: ${error instanceof Error ? error.message : String(error)}`, variant: "error" };
    } finally {
      pill.remove();
      running.delete(agentId);
    }
    if (note) lent.toast?.show(`${feedback.text}. ${note}`, { variant: "warning", durationMs: 8000 });
    else if (lent.toast) lent.toast.show(feedback.text, { variant: feedback.variant, durationMs: feedback.variant === "error" ? 6000 : 2500 });
    else if (feedback.variant === "error") throw new Error(feedback.text); // Command hosts toast thrown errors.
  };

  const cleanups = [
    // Command Center requires a built-in glyph; tab and workspace icons are untouched.
    client.addCommandCenterItem({ id: "retitle", title: "Retitle this tab", icon: "Type", keywords: ["title", "rename", "tab"], context: "agent", onSelect: ({ agent, workspace }) => run(agent.id, workspace.id) }),
    client.addSlashCommand({ name: "retitle", description: "Rename this tab if its title no longer fits", argumentHint: "", context: "agent", onSubmit: ({ agent, workspace }) => run(agent.id, workspace.id) }),
  ];

  if (Platform.OS === "web") {
    // Ctrl+Alt+T targets the selected agent tab of the pane last clicked or focused.
    // Paseo's non-Mac "Cycle theme" uses the same combo, and its window listener
    // runs before any plugin's, so it cannot be shadowed. When it fired (the event
    // arrives default-prevented), say once how to avoid it: the desktop app can
    // unbind it; the browser app cannot.
    let clashExplained = false;
    const clashNote = navigator.userAgent.includes("Electron")
      ? "Ctrl+Alt+T also cycled the theme: clear “Cycle theme” in Settings → Shortcuts."
      : "Ctrl+Alt+T also cycles Paseo's theme in the browser; Ctrl+K → Retitle this tab doesn't.";
    let lastPane: Element | null = null;
    const track = (event: Event) => { lastPane = (event.target as Element | null)?.closest?.(PANE) ?? lastPane; };
    const keydown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || !event.altKey || event.metaKey || event.shiftKey || event.repeat || event.isComposing || event.getModifierState("AltGraph")) return;
      if (event.code !== "KeyT" && event.key.toLowerCase() !== "t") return;
      if (document.querySelector('[role="dialog"], [aria-modal="true"]')) return;
      const panes = [...document.querySelectorAll(PANE)].filter(pane => pane.getClientRects().length > 0);
      const pane = panes.find(candidate => candidate === lastPane) ?? (panes.length === 1 ? panes[0] : undefined);
      const agentId = pane?.querySelector(TAB)?.getAttribute("data-testid")?.slice("workspace-tab-agent_".length);
      if (!agentId) return;
      const note = event.defaultPrevented && !clashExplained ? clashNote : "";
      clashExplained ||= Boolean(note);
      event.preventDefault();
      event.stopImmediatePropagation();
      void client.paseo.agents.ref(agentId).refresh()
        .then(snapshot => snapshot?.agent.workspaceId && run(agentId, snapshot.agent.workspaceId, note))
        .catch(error => console.warn("titles: Ctrl+Alt+T failed", error));
    };
    document.addEventListener("pointerdown", track, true);
    document.addEventListener("focusin", track, true);
    window.addEventListener("keydown", keydown, true);
    cleanups.push(() => {
      document.removeEventListener("pointerdown", track, true);
      document.removeEventListener("focusin", track, true);
      window.removeEventListener("keydown", keydown, true);
    });
  }
  return () => cleanups.forEach(cleanup => cleanup());
}
