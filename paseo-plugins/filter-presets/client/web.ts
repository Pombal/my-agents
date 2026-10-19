import { Platform } from "react-native";
import type { Project } from "../shared/presets";

interface StyleElement {
  textContent: string | null;
  setAttribute(name: string, value: string): void;
  remove(): void;
}
declare const document: {
  createElement(tag: "style"): StyleElement;
  head: { appendChild(element: StyleElement): void };
};
declare const localStorage: {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};
const storageKey = "paseo-plugin:filter-presets:selected";

export function readSelection(): string {
  if (Platform.OS !== "web") return "all";
  try { return localStorage.getItem(storageKey) || "all"; } catch { return "all"; }
}

export function writeSelection(id: string): void {
  if (Platform.OS !== "web") return;
  try { localStorage.setItem(storageKey, id); } catch { /* Private browsing can deny storage. */ }
}

export interface WorkspaceRef { id: string; projectId: string }

export interface SidebarFilter {
  apply(hostId: string, projects: Project[], hidden: Project[], workspaces: WorkspaceRef[]): void;
  remove(): void;
}

export function createSidebarFilter(): SidebarFilter {
  if (Platform.OS !== "web" || typeof document === "undefined") {
    return { apply() {}, remove() {} };
  }
  const style = document.createElement("style");
  style.setAttribute("data-plugin", "filter-presets");
  document.head.appendChild(style);
  return {
    apply(hostId: string, projects: Project[], hidden: Project[], workspaces: WorkspaceRef[]) {
      const hiddenIds = new Set(hidden.map((project) => project.projectId));
      const selectors = new Set<string>();
      for (const project of hidden) {
        // 0.12 uses host/project-ID view keys when several projects share a remote.
        const keys = [JSON.stringify([hostId, project.projectId])];
        if (project.projectKey && projects.every((other) => other.projectKey !== project.projectKey || hiddenIds.has(other.projectId))) {
          keys.push(project.projectKey);
        }
        for (const key of keys) {
          const testId = JSON.stringify("sidebar-project-row-" + key);
          // Hide the enclosing project group, not just its header. No host style is mutated.
          selectors.add(`[role="group"]:has([data-testid=${testId}])`);
        }
      }
      // "Group by status" lists workspace rows without project groups; hide those rows one by one.
      const hiddenRows: string[] = [];
      for (const workspace of workspaces) {
        if (!hiddenIds.has(workspace.projectId)) continue;
        const testId = JSON.stringify(`sidebar-workspace-row-${hostId}:${workspace.id}`);
        hiddenRows.push(`[data-testid=${testId}]`);
        selectors.add(`[data-testid=${testId}]`);
      }
      if (hiddenRows.length) {
        // A status section (header + rows list) whose every row is hidden would show a bare heading.
        // Sections with "Show more" stay: their unrendered rows may match.
        selectors.add(`div:has(> [data-testid^="sidebar-status-group-rows-"])`
          + `:not(:has([data-testid^="sidebar-workspace-row-"]:not(${hiddenRows.join(",")})))`
          + `:not(:has([data-testid^="sidebar-status-group-show-more-"]))`);
      }
      style.textContent = selectors.size ? [...selectors].join(",\n") + " { display: none !important; }" : "";
    },
    remove() { style.remove(); },
  };
}
