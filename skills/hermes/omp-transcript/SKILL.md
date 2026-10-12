---
name: omp-transcript
description: "Agent-session catch-up: use when reading or consolidating OMP, Claude Code, Codex or T3 Code session history without loading tool-result bloat."
---

# OMP Transcript

1. Render the session’s active branch instead of reading its JSONL directly:
   ```bash
   omp-transcript '<session.jsonl>' > /tmp/omp-transcript.md
   ```
   For a Claude Code session, a Codex thread or a T3 Code thread, use `agent-transcript '<session.jsonl or id>'` instead: same flags, same format. It accepts an OMP id too.
2. Read the rendered transcript.
3. If an omitted result matters, run its embedded `omp-transcript result ...` or `agent-transcript result ...` command. Hydrate only results needed to understand the work.

Both CLIs are read-only. Completion means the catch-up is grounded in the conversation, reasoning, and only the necessary hydrated results.
