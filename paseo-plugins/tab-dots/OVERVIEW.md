# Tab dots

Small dots on each workspace row in the sidebar, one per tab, so you can see which workspaces have something waiting without opening them. By default only unread tabs get a dot, and a row with nothing unread looks exactly as before.

Colours follow Paseo's own status colours:

- Green: the agent finished and you haven't looked yet.
- Red: error.
- Amber: waiting for your permission.
- Blue: running (only in the "Unread and running" and "Every tab" modes). A running dot rests small and dim, and a short flash grows it to full size; several running dots flash one after another, left to right, and all rows keep the same beat. Still dots when the system asks for reduced motion.
- Gray: read (only in "Every tab").

Hover a dot to see the tab's title and state; click it to open that tab (which marks it read). Dots follow the tab order of that workspace on this device (all panes, left to right). Sub-agents are left out. For a workspace this device hasn't opened recently, tabs missing from the saved layout are added in the same order Paseo will add them the next time you open it.

## On phones

The phone apps can't put dots on each row, so they get one **Unread** row at the top of the sidebar instead, with one dot per tab waiting on you across all workspaces. It is hidden when nothing is unread. Tap it for a sheet listing those tabs (title, project and workspace, state, how long ago); tap a tab to open it. "Open as a screen" shows the same list full screen. With "Unread and running" or "Every tab", running tabs are listed too; read tabs never are. Web and desktop never show this row.

## Settings

Settings → Plugins → tab-dots → Tab dots, or ⌘K "Tab dots settings" (⌘K "Toggle tab dots" turns it on and off). Both commands show only on workspace pages, like other plugin commands.

- **Which tabs**: Unread (default), Unread and running, or Every tab.
- **Dot size**: Regular (5 px, up to 5 dots) or Small (4 px, up to 8). Extra tabs show as "+N"; tabs waiting on you are kept first, then running ones.
- **Replace the time** (on by default): rows with dots hide their last-activity time.
- **Dot position**: Right edge (default) puts the dots where the time was; hovering the row brings back the row menu, so they move left by its width. Steady keeps them on the right but never moves them, leaving the menu's room free. Left puts them right after the workspace title.

Settings are stored on the host, so every window and phone connected to it uses them. Replace the time and Dot position only apply to web and desktop.

## Limits

- Row dots are web and desktop only: Paseo has no plugin slot in sidebar rows, so they are added to the page directly.
- Opening a tab from the phone sheet goes through the plugin's Unread screen (Paseo lets only plugin screens open a tab), so you may see it for a moment. Tested at phone width in the web app; not yet on the iOS or Android apps.
- "Mark as read" on a workspace leaves permission requests flagged until you answer them, so amber dots stay.
- Tested on Paseo 0.12.0 in the web app, grouped by project and by status.
- It reads Paseo's internal tab layout from the browser's storage and the row's internal structure. A Paseo update can change either: the order then falls back to Paseo's default, or the dots stop showing. The sidebar itself keeps working.
