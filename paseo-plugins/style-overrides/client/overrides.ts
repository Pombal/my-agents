// Keep each personal tweak in its own dated CSS block; the injector never needs editing.
export const overrides = `
/* 2026-10-19 — Stefan: "smaller gap between sidebar items, so I see more items
   and feel less boxed in, even if it's not the textbook design."
   Preserve font sizes, horizontal indentation, hover/selection colors and menus.
   Use min-height, not height: multi-line/nested content can still grow. */
[data-testid^="sidebar-workspace-row-"],
[data-testid^="sidebar-project-new-workspace-row-"] {
  min-height: 28px !important;
  padding-top: 4px !important;
  padding-bottom: 4px !important;
  margin-bottom: 0 !important;
}
[data-testid^="sidebar-project-row-"] {
  min-height: 32px !important;
  padding-top: 4px !important;
  padding-bottom: 4px !important;
  margin-bottom: 0 !important;
}
`;
