# Side agent

Create a visible Paseo child agent from the current chat with `/side <task>`.
The command requires an existing agent chat and a non-empty task. The child uses
its parent's current provider/model, mode, thinking option, feature values, and
working directory. Paseo parentage puts it in the parent's sub-agents strip.
It does not interrupt the parent or send the side task into the parent conversation.
**There is no finish notification in the parent; check the side agent's tab.**
Paseo's SDK `parent` field establishes parentage, but unlike MCP agent creation
does not register a finish callback. This plugin deliberately does not simulate
one by sending another message into the parent (which would start a paid turn).

## Why `/side`, not `//side`?

The plugin first attempts to register `name: "/side"` (which would match
`//side`). Paseo rejects this with `Invalid client slash command name: /side`:
client contribution names must match `/^[a-z][a-z0-9-]*$/`. Only this specific
registration error enables the fallback `name: "side"`. Thus `/side` is the
working command on current clients; `//side` is not intercepted or rewritten.
The `/side` autocomplete entry says “Spin off a visible side agent with parent
context”. No global composer hooks or changes to OMP slash commands are used.
The separate `omp-slash-aliases` plugin and its `/tan`, `/omfg`, `/queue` commands
are unchanged.

## Context: A, read-only parent transcript

For OMP, the plugin refreshes the parent through the public Paseo client SDK and
reads `agent.persistence.nativeHandle`, the absolute OMP `.jsonl` session path.
The initial prompt contains that path and the requested task. It tells the child
to read the transcript for context, never resume or modify it, and report back
concisely. If the OMP session path is not available, creation fails with an
explanation rather than silently starting without context. Non-OMP parents get
the same side-task preface without an OMP file path and are told to identify
missing context.

This is **not a fork or a frozen snapshot**. The child starts a fresh session and
must read the transcript using its tools. An active parent's transcript can grow
while it works. Reading a large transcript consumes context/tokens; provider
permissions or model behavior can prevent the read. Shared cwd also means shared
files: side tasks are not worktree-isolated.

B was examined but is not available through safe client-only creation: OMP's CLI
has `--resume <path>` (not a fork flag), while Paseo's installed OMP
`OmpProviderOptionsSchema` strictly accepts only `sessionDir`, `rpcTimeoutMs`,
`smolModel`, `slowModel`, and `planModel`. Fresh `createSession` supplies no resume
file. The separate session-import request does not support parentage or copying,
and resuming the parent's existing native handle would write to its session.
No server code, provider patches, session copies, or daemon restarts are used.

## Clients and panes

- **Wide web / desktop:** capture the submitting chat's pane. If another visible
  pane overlaps vertically to its right, focus its selected tab and open the child
  there. Otherwise, in a single-pane layout, invoke Paseo's own pane-menu **Split
  pane right** action and open the child in the newly focused right pane. Repeating
  from the parent adds another tab to that right pane, not a third pane.
- **Existing complex layouts:** no extra pane is created when multiple visible
  panes already exist and none is to the right. Opening falls back to the normal
  current-pane behavior. A visible Explorer can count as a right-hand pane.
- **Phone / native:** use ordinary host `navigation.openAgent`; no DOM or split
  operations run. Compact web layouts without desktop panes also open normally.
- Slash callbacks do not expose navigation directly. A transient registered
  plugin screen receives the host's public navigation API and immediately opens
  the created agent. Old clients missing that API display an explanation; the
  child remains accessible through the parent's sub-agents strip.

DOM access and pane operations are gated by `Platform.OS === "web"`. Placement
failure falls back to normal opening without losing the created child. The pane
integration depends on Paseo's `workspace-pane-*`, `workspace-tab-*`,
`workspace-split-pane-menu`, and `workspace-split-pane-right` test IDs and normal
pointer/focus event behavior. UI changes, unavailable split actions, or a layout
change during agent startup can break best-effort placement. It does not rely on
OS-specific split keyboard shortcuts (the current built-in shortcut is Mac-only).

## Install, disable, update

From this directory's parent:

```sh
flock /tmp/paseo-plugin.lock paseo plugin install ./side-agent
flock /tmp/paseo-plugin.lock paseo plugin reload side-agent
paseo plugin ls side-agent
paseo plugin disable side-agent
```

Disabling removes the command; existing children and their conversations remain.
This is a client-only plugin. No dependency installation is needed. A temporary
link to the existing `chat-diff-highlight/node_modules` was used for typechecking
and removed afterward because the link was not git-ignored.

## Live evidence

Screenshots are in `screenshots/`:

- `autocomplete.png`: working `/side` autocomplete entry.
- `first-side-right-split.png`: first submission opens a child to the right of
  the parent, with the child relationship shown in the parent's strip.
- `second-side-same-right-pane.png`: a second side task is another tab in that
  same right pane, with only two visible panes.
- `tan-alias-unaffected.png`: the original OMP tangent alias remains offered.
- `parent-context-proven.png`: the child read the parent's session file and
  recovered `violet-compass-283`, a codeword supplied only in the parent chat.
- `child-parentage-strip.png`: expanded parent sub-agents strip lists both
  children, alongside the child's transcript read and correct answer.

Live submissions passed with inexpensive Claude Haiku 4.5 through OMP: first
right split, second tab in that same right pane, both children in the parent's
sub-agents strip, matching provider/model/mode/thinking/cwd, and transcript
context recovery. An ordinary parent message also worked. `/tan` autocomplete
was checked; its submission was not re-exercised by this plugin's test.
Initial GPT-5.4 Mini requests stalled, and GLM 5.2 Free returned an unavailable-model
404; those were provider limitations, not plugin failures. The final screenshots
of split/repeat/context use Haiku. All test agents/workspaces were archived.
The client sources typechecked with TypeScript (`es2024`, DOM/DOM iterable,
React JSX, bundler module resolution); plugin status was `running`.

Testing uses an isolated Chromium browser context paired to the live web app.
Native iOS/Android and Electron itself have not been exercised; their behavior
above describes the implemented public-navigation/web paths, not device proof.
