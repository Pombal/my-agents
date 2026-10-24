# strip-keywords

Hides magic keywords from the model while keeping them in the session file.

Configure `$PI_CODING_AGENT_DIR/strip-keywords.json` (normally `~/.omp/agent/strip-keywords.json`). Each keyword is a literal, case-sensitive string, removed from user messages only where it stands as its own whitespace-delimited token. Edits apply on the next request; a missing or invalid file disables stripping.

```json
{ "keywords": ["@@ping"] }
```
