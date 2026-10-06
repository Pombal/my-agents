# T3 Code skills

Made-up folder, mine. Skills for agents I run from T3 Code (Claude Code, Codex), kept out of OMP.

Each skill folder is symlinked into `~/.claude/skills/` and `~/.codex/skills/`. OMP ignores both (`skills.enableClaudeUser` / `enableCodexUser` are off).

```bash
for d in ~/workspace/my-agents/skills/t3-code/*/; do
  ln -sfn "${d%/}" ~/.claude/skills/; ln -sfn "${d%/}" ~/.codex/skills/
done
```
