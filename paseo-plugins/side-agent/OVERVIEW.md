# Side agent

Create a visible child of the current Paseo agent:

```text
/side [task]          use the configured default (initially fork)
/side --fork [task]   force curated Paseo chat history
/side --full [task]   force complete OMP memory through the last completed turn
```

An existing agent is required; the task is optional. Without a task, the title is
`Side: <parent title>` (shortened). With a task, the title uses its first words.
The child gets the parent's
provider/model, mode, thinking option (including the provider's active default), feature values, and working directory.
It appears in the parent's sub-agents strip. Shared cwd means shared files, not
an isolated worktree. **No finish message is sent into the parent:** check the
side agent's tab. Sending a synthetic notice would start another parent turn.

The old session-file-pointer prompt mode has been removed entirely.

## Choosing context

### Fork — default, cheaper, all providers

This is Paseo's own **Fork in a new tab** context: the server calls the installed
SDK's `buildAgentForkContext(parentId)` and attaches its text attachment with
`contextKind: "chat_history"` to `agents.create({ attachments })`. With a task,
the initial prompt is a short parent/side-task note plus your task. Without one,
the attachment rides on this note: “You are a side agent forked from Paseo chat
<id>. The attached chat history belongs to the parent. Wait for the user's
instructions; reply only: Ready.” The child acknowledges, then waits for you.

The attachment contains curated user/assistant messages and tool-call summaries,
not raw tool outputs, private reasoning, or native provider session state. It is
capped at **100,000 characters**, retaining the newest history when truncated.
It can include an in-progress parent's current visible messages. Facts that
exist only in a tool's output are not available in this mode.

### Full — OMP only, real session memory

The server refreshes the parent and obtains its native session file from
`persistence.nativeHandle`. It opens that file read-only, reads a bounded byte
snapshot, discards any unterminated final JSONL line, and validates the records.
The copy stops at the latest assistant message with terminal `stopReason`
`stop`/`length` and no tool-call blocks. **The entire current unfinished turn is
excluded**, including its user message, tool requests, and partial response.
If there is no completed turn, the command refuses and recommends `--fork`.

A new timestamp/UUID filename and session-header ID are created alongside the
parent's `.jsonl`. Entry/tool-call IDs remain unchanged. The new header records
the parent session and preserves its prompt-cache key, matching OMP's native fork
convention. The sibling artifact directory is copied recursively, so relative
`artifact://` and `agent://` references have an independent artifact root. Symlinked
artifacts are refused. Absolute paths embedded in historical text are not
rewritten; existing OMP compaction is not undone.

After the completed-turn cut, the copy gets one OMP `custom_message` entry with
`customType: "side-fork"`, `display: true`, and `attribution: "agent"`.
Its fresh entry ID links through `parentId` to the copied completed assistant
entry. Its content is:

> You are a side agent forked from Paseo chat <id> (<parent title>). The conversation above belongs to the parent; earlier tasks are not yours. Work only on what the user asks next.

OMP replays this entry into model context on resume without starting a turn.
Paseo shows it as a **collapsed, expandable synthetic tool row** before the next
user message. The UI humanizes `side-fork` to **Side fork**; expanding it reveals
the note text. This is context metadata, not an executed tool or model turn.
The imported turn's “Worked for” footer may include the note timestamp even
though the child remains idle with `LastUsage: null`. Resume behavior was proven
against the authoritative `~/.local/bin/omp` binary (18.11.0).

Paseo imports the copied file as a new OMP agent with the
`paseo.parent-agent-id` label and applies the parent's current runtime settings.
With a task, it sends **only the task text**, without a duplicated fork note.
**Without a task it sends nothing at all**: the imported child opens idle with
no new user/assistant message or model turn, but with the visible side-context
entry ready for the first prompt. The parent is never resumed or written by
this operation. Full mode inherits native conversation/tool-output memory,
not just a transcript attachment; long histories can be slower and more costly.
Earlier parent instructions are also inherited and can affect the child's reply.

A raw mid-tool copy was tested and rejected: it could replay the parent's pending
command. The completed-turn boundary above was then proven to exclude that
command while the parent continued running normally.

## Default mode setting

Open **Settings → Host → Plugins → Side agent → Default mode**. Choices are
**Fork — curated chat history** and **Full — complete OMP memory**. This is a
persisted host setting, initially `fork`, shared by clients connected to that
host. Explicit `--fork` or `--full` wins over the setting. The live test changed
it to full, verified persistence and overrides, then restored it to fork.

## Desktop, web, and phone

On wide web/desktop layouts, the submitting chat's pane is captured. An existing
pane to its right is reused. Otherwise, a single-pane layout invokes Paseo's own
**Split pane right** menu action. Repeated submissions add tabs to that right
pane, not a third pane. With multiple existing panes and no right-hand target,
normal opening is used rather than creating another pane. Placement failures
also fall back to normal opening without losing the child.

Phone/native uses public host `navigation.openAgent`, without DOM or split
operations. Slash callbacks expose `openScreen`, not navigation directly, so a
transient registered screen obtains that public navigation API and immediately
opens the child. Old clients without the API show an explanation; the child is
still accessible through the parent's sub-agents strip.

All DOM/pointer code is gated by `Platform.OS === "web"`. It depends on Paseo's
`workspace-pane-*`, `workspace-tab-*`, and split-menu test IDs. UI changes,
custom layouts, or layout changes during startup can break best-effort placement.
Electron and native iOS/Android devices were not directly exercised; headless
Chromium proves the web implementation, not those device integrations.

## Why `/side`, not `//side`?

The plugin first attempts `name: "/side"`, which would match `//side`. Current
Paseo rejects it because contribution names must match `/^[a-z][a-z0-9-]*$/`.
Only that specific registration error enables the fallback `name: "side"`.
Thus `/side` is the working command; `//side` is not intercepted or rewritten.
The autocomplete description is “Side agent with parent context · --fork / --full”,
so both flags are visible in the list row as well as the argument hint.
The separate `omp-slash-aliases` plugin is untouched; `/tan`, `/omfg`, and `/queue`
remain independent. There are no global composer hooks.

## Files and operation

- Fork mode creates only the normal Paseo/OMP child session.
- Full mode additionally creates `<timestamp>_<new-uuid>.jsonl` in the parent's
  session directory and, if present, a same-stem artifact directory. These are
  the real child's persistent session and are **kept for real usage**, including
  after normal archival. There is no automatic session deletion hook.
- Failed full launches archive the imported child and remove their copy when
  cleanup succeeds. The live tests archived their agents before explicitly
  deleting all test-created full-memory copies and sidecar directories.
- The minimal server part registers settings and one RPC handler; it has no
  lifecycle hooks. It uses a short-lived installed SDK connection for native
  fork/import/config RPCs, authenticated to the published **loopback TCP** daemon
  under `PASEO_HOME` (or `~/.paseo`). Socket-only or unpublished endpoints are not
  supported and fail clearly. Local credentials are never sent to remote hosts.
- `node_modules` is an ignored symlink to the already-installed neighboring
  `chat-diff-highlight/node_modules`; no npm install was run.

```sh
flock /tmp/paseo-plugin.lock paseo plugin reload side-agent
paseo plugin ls side-agent
paseo plugin disable side-agent
```

Disabling removes the command, not existing agents or saved sessions. No daemon
restart, Paseo source patch, provider patch, or commit is involved.

