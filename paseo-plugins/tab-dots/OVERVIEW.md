# Tab dots

Small dots on each workspace row in the sidebar, one per tab, so you can see which workspaces have something waiting without opening them. By default only unread tabs get a dot, and a row with nothing unread looks exactly as before.

Colours follow Paseo's own status colours:

- Green: the agent finished and you haven't looked yet.
- Red: error.
- Amber: waiting for your permission.
- Blue, slowly pulsing: running (only in the "Unread and running" and "Every tab" modes).
- Gray: read (only in "Every tab").

Hover a dot to see the tab's title and state; click it to open that tab (which marks it read). Dots follow the tab order of that workspace on this device (all panes, left to right). Sub-agents are left out. For a workspace this device hasn't opened recently, tabs missing from the saved layout are added in the same order Paseo will add them the next time you open it.

## Settings

Settings → Plugins → tab-dots → Tab dots, or ⌘K "Tab dots settings" (⌘K "Toggle tab dots" turns it on and off). Both commands show only on workspace pages, like other plugin commands.

- **Which tabs**: Unread (default), Unread and running, or Every tab.
- **Dot size**: Regular (5 px, up to 5 dots) or Small (4 px, up to 8). Extra tabs show as "+N"; tabs waiting on you are kept first, then running ones.
- **Replace the time** (on by default): rows with dots hide their last-activity time.
- **Dot position** (with Replace the time): Right edge (default) puts the dots where the time was; hovering the row brings back the row menu, so they move left by its width. Steady never moves them and leaves the menu's room free.

Settings are stored on the host, so every web or desktop window connected to it uses them.

## Limits

- Web and desktop apps only. Paseo has no plugin slot in sidebar rows, so the dots are added to the page directly; phones show nothing.
- "Mark as read" on a workspace leaves permission requests flagged until you answer them, so amber dots stay.
- Tested on Paseo 0.12.0 in the web app, grouped by project and by status.
- It reads Paseo's internal tab layout from the browser's storage and the row's internal structure. A Paseo update can change either: the order then falls back to Paseo's default, or the dots stop showing. The sidebar itself keeps working.
