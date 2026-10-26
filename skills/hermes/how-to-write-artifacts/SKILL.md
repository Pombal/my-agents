---
name: how-to-write-artifacts
description: Use only when the user explicitly says "write a vault artifact".
---

Write artifacts to the shared Obsidian vault artifact folder, not to repo-local artifact folders.

Use when asked to write durable agent artifacts, evaluation notes, handoffs, plans, to-do artifacts, or other shared Obsidian vault records.

## Artifact path

Use this folder shape:

```text
<obsidian-vault>/Notebox/Atoms/Agent Artifacts/YYYY-MM Month/DD dddd/YYYY-MM-DD HHMM PROJECT (CONTEXT) - Kind by MODEL - Distinctive subject.md
```

Set `<obsidian-vault>` to the local Obsidian vault root:

- Linux / this workstation: `/mnt/obsidian-vault`
- Windows: `C:\Users\<Windows user>\Documents\Obsidian Vault`

Filename shape, verbatim:

```text
YYYY-MM-DD HHMM PROJECT (CONTEXT) - Kind by MODEL - Distinctive subject.md
```

If a distinct app/surface matters, use this variant:

```text
YYYY-MM-DD HHMM PROJECT (CONTEXT) - Kind by MODEL via APP - Distinctive subject.md
```

Filename rules:

- Keep the full timestamp in the filename.
- Use monthly folders, then daily folders: `YYYY-MM Month/DD dddd`.
- Use ` - ` as the main separator.
- Avoid `[]` and `#` in filenames.
- Write `PR 1234`, not `PR #1234`.
- Parentheses are allowed for one concise context qualifier, e.g. `Acme (PR 123)`.
- Use a short model name in the filename: `GPT`, `Opus`, `Kimi`, `Composer`, `Fable`, etc.

Examples:

```text
2026-01-05 0900 Acme - Report by GPT via OMP - Example parser migration.md
2026-01-05 0930 Acme - Review by Fable via Cursor - Example validation tests.md
2026-01-06 1000 Personal - Review by GPT via Agent - Example specification corrections.md
2026-01-06 1100 Acme (PR 123) - Handoff by GPT via Agent - Example integration test.md
```

## Frontmatter

Use this shape, omitting any field that cannot be known reliably:

```yaml
---
kind: evaluation
created: 2026-06-25 11:05
by_model: GPT-5.5
project: Acme
context: Acme example-feature
origin_folder: /path/where/the/agent/was/active
git_repo: owner/repo
git_branch: branch-name
pr: 1234
agent: Hermes-Rhinox
source_path: old/artifact/path.md
supersedes: old/artifact/path-or-wikilink.md
superseded_by: newer/artifact/path-or-wikilink.md
---
```

Do not invent metadata. If uncertain context is still useful, write it in the body as a note, not as authoritative frontmatter.

Use the full model name in frontmatter when known.

If asked to create a to-do artifact, write the artifact normally and add `#todo` somewhere in the body.

To archive an artifact, add frontmatter fields `archived: true` and `status: done` or `status: cancelled`; if the current context does not make the status knowable, use `status: cancelled`.

## Body

Write for a reader with zero context: include the problem, approach, reasoning, sources, and exact next actions needed to continue.
