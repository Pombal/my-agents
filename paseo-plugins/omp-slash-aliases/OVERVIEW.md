Adds composer aliases `/tan <work>`, `/omfg <correction>` and `/queue <message>` for Paseo's `omp` provider, without cancelling the current reply. `/tan` and `/omfg` are sent through `/follow-up`; `/queue` sends its message through `/follow-up`. See the tangent-answer limitation below before relying on `/tan`.

Client-only, using Paseo's public slash-command API (0.11.4+): web, desktop, iOS and Android. Refresh/reopen an already-open app after installation. No setting is required. Disable with `paseo plugin disable omp-slash-aliases`.

Other providers receive the original slash command unchanged. Paseo's own built-in client commands still win collisions. The plugin requires text arguments; it does not run with attachments (a Paseo API limitation), so send these commands without attachments.

Requires OMP's existing `headless-builtins` extension and OMP 18.11.0's follow-up input hooks. `/tan` uses OMP's real background tangent controller but has no MCP tools. **Paseo 0.11.4 hides the tangent's answer:** it shows only “Background job … has completed”, not the remaining result text. The answer reaches the parent OMP session and is retained in its transcript, but the app does not expose it. The installed provider's `omp/system-notice.js` maps these notices to their first line; an alias cannot repair that renderer.

`/omfg` uses OMP's real rule controller and can save persistent rules. The app shows the save-location question, but not OMP's draft-rule panel. Choose a project location only when appropriate; inspect the saved file to review its contents. Dismiss cancels saving. Generation can take time while Paseo still says idle.

This does not implement `/btw` or `/goal`: those need changes to OMP's headless extension/provider integration, not composer aliases. OMP internal controller or RPC changes could break these routes; this plugin does not patch OMP or restart the daemon.

## Live proof (2026-10-19)

Tested in the paired web app with a disposable OMP agent, `4f0260b3-a65e-4b36-8ecf-914a62f43793`, in `/home/cx/tmp-archive/paseo-slash-test`. Nemotron 3.5 Lightning (Free) worked at zero reported cost; GLM 5.2 Free returned “model unavailable” and that first agent was archived.

- Before installing: `/follow-up /tan …` dispatched and returned `TAN_IDLE_OK` at 08:18:24 UTC. During a running reply, `/follow-up /tan …` returned `TAN_BUSY_OK`; the main reply still finished `MAIN_BUSY_FINISHED`, then the queued `hello` received a greeting.
- From the actual composer after installing: plain `/tan …` returned `TAN_COMPOSER_IDLE_OK` in OMP at 08:20:20; plain `/queue …` returned `QUEUE_COMPOSER_IDLE_OK` at 08:20:35.
- During a real `sleep 30` tool call, plain `/tan`, `/queue` and `/omfg` were submitted from the composer. OMP delivered `TAN_COMPOSER_BUSY_OK` at 08:21:14; the uninterrupted main reply finished `COMPOSER_MAIN_FINISHED` at 08:21:15; only then was the queued message consumed and answered `QUEUE_COMPOSER_BUSY_OK` at 08:21:17. No aborted main turn.
- Busy `/omfg` generated a real rule, showed the save-location question, and saved `hello-instead-of-hi.md` under the scratch project's `.omp/rules`, confirmed in the timeline. Idle `/omfg` also showed the real save-location question; Dismiss was used. No global rule was created; the scratch rule was removed after testing.
- Provider-forwarding callback checks: all three commands forward unchanged for Claude, Codex and `omp-nilo`; only `omp` rewrites to `/follow-up`. All three registrations clean up. Other providers were not exercised against live models.
- Screenshots: `screenshots/omfg-busy-choice.png` shows the real save-location question during the busy test; `screenshots/composer-busy-results.png` shows the main completion, queued reply, saved-rule confirmation and later idle question; `screenshots/omfg-idle-choice.png` captures the idle save question.

The underlying OMP transcript with full tangent results is `/home/cx/.omp/agent/sessions/-tmp-archive-paseo-slash-test/2026-10-19T08-18-07-145Z_01a1533d-46a9-7639-9f62-4c9e47877f34.jsonl`. Both throwaway Paseo agents and their workspace were archived. Web was tested live; desktop/phone coverage is from the public cross-client API, not device testing.
