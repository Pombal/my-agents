---
name: design-loop
description: Review loop for a mocked design: Fable critic until happy, then an overcorrection check.
disable-model-invocation: true
---

# Design loop

Runs once Stefan has picked a direction from the first mockups. Taste lives
with the mock base (its README, "Deceptive simplicity").

## Critic

Fable at extra-high thinking, as a shell command because the subagent tool
can't set its level: `omp -p --model anthropic/claude-fable-5-1:xhigh`.
It gets the brief, every round, the engineering notes and the real data,
and ends with `VERDICT: HAPPY` or `NOT HAPPY` plus must-fixes. Redesign and
re-review until HAPPY, three rounds at most; each round carries numbered
notes on what changed and why (mock base README, "Base and notes").

## Overcorrection check

Before building, the critic compares the final round with every earlier
one, the first included. Each trimmed item is dropped correctly, restored,
or Stefan's call with a recommendation. Nothing his call: build. Otherwise
bring him those items first.

## Options

Stefan sees options only as the results of genuine deliberation: huge
advantages on each side, no clear winner. Everything else is trashed, never
offered as one sensible option beside filler.
