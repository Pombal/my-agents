# usage-guard

Enforces provider usage thresholds with warnings, subagent draining, or a global pause.

Configure `$PI_CODING_AGENT_DIR/usage-guard.json` (normally `~/.omp/agent/usage-guard.json`). Inactive until `/usage-guard activate`. `/usage-guard deactivate` stops enforcement for this session. `status`, `reload`, and `resume [provider]` inspect, reload, or acknowledge.

A rule must name an exact `limit`, `window`, or both from `omp usage --json --provider <provider>`. Actions are `warn`, `drain-subagents`, and `pause`; the strongest crossed action wins. `drain-subagents` blocks new `task` calls and leaves running jobs. `pause` engages OMP's process-global pause gate. An acknowledgement lasts for the current quota window, so a reset re-arms the rule. Headless `pause` drains new subagents instead, because there is no resume UI. Missing fresh data for an enforcement rule blocks new `task` calls.

```json
{
  "pollSeconds": 60,
  "forceRefreshSeconds": 60,
  "staleAfterSeconds": 180,
  "commandTimeoutSeconds": 20,
  "rules": [
    {
      "provider": "openai-codex",
      "window": "7d",
      "thresholdPercent": 50,
      "action": "drain-subagents"
    },
    {
      "provider": "anthropic",
      "window": "5h",
      "thresholdPercent": 90,
      "action": "pause"
    }
  ]
}
```
