---
name: omp-sessions
description: Pull context from Stefan's OMP (Oh My Pi) coding-agent sessions. Use when Stefan mentions an OMP session, session id, or past OMP conversation, wants to continue one here, or asks what was said or decided in one.
---

# OMP Sessions

OMP is Stefan's terminal coding-agent harness. Its sessions are JSONL logs, often huge. Never read them directly. Use `omp-transcript` (on PATH, read-only), which renders the active branch as markdown with tool results collapsed.

Always pass `--profile all`. Without it, sessions in non-default profiles (e.g. `nilo`) are not found.

## Find the session

```bash
omp-transcript list --profile all -n 10                  # newest first: time, id, title, cwd, path
omp-transcript list --profile all --cwd ~/workspace/nilo  # sessions started in that dir
omp-transcript search --profile all "pattern" -n 10      # literal; --regex, --reasoning, --with-tools widen it
```

An id prefix works in place of a full id or path.

## Read it

```bash
omp-transcript <id> --profile all > /tmp/omp-<id>.md     # whole conversation, tool results omitted
omp-transcript <id> --profile all -m -3                  # last 3 messages; -m 3 = first 3
```

Add `--reasoning` for the agent's thinking, `--with-tools` for tool calls. When an omitted result matters, run the `omp-transcript result ...` command printed in its place. Hydrate only what you need.

## Continue a session here

Render the whole transcript, read it, then give Stefan a short recap: the goal, decisions made, the current state, and the open next step. Confirm before you act on it. The session's cwd is the project to work in.

## Many sessions at once

`@omp-session-recap [dir]` summarizes every session started in a folder with an OMP model. It's slow and costs tokens, so use it only when asked or when a dozen transcripts would otherwise be needed.
