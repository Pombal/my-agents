---
name: design-loop
description: Design a feature with mockups, an independent critic and three decision gates for Stefan, then build it.
disable-model-invocation: true
---

# Design loop

Stefan describes an idea in his own words. He gets back a built feature whose
design he chose, and he steps in only at the three gates.

## The design: deceptive simplicity

Clear and dense, not busy. Content first; secondary chrome muted, small, or
behind hover, tooltips and pop-outs; nothing visible unless it's relevant,
and orienting information never stripped away. Repeated information is not
repeated. Nothing is lost, only reorganised with extreme cleverness: not
less information, a focused representation of it by importance and context,
each fact in one home at the level it earns (glance, hover, click). Phones
have no hover; what desktop hides behind hover opens on tap.

Simplicity never equates to confusion. A screen that is even a little bit
confusing didn't get simpler; it got more complicated to understand.

Claims hold against reality: real data, real platform limits, the platform's
default and minimum sizes.

## Gates

Stefan decides at three gates; everything else is settled and listed for
him. Options reach him only as the results of genuine deliberation: huge
advantages on each side and no clear winner. Everything else is trashed,
never offered as one sensible option beside filler.

1. **Direction.** Done when he has every candidate place on screen for the
   feature (phone included), the engineering findings with file:line
   evidence and effort scores, and one recommendation.
2. **Design.** Done when the critic's verdict is HAPPY and its nits are
   applied. Every round after the first is reviewable by flipping: old
   version, annotations, nothing lost (see the mock base README).
3. **Overcorrection.** Done when the check has sorted every item trimmed
   since the first round into: dropped correctly, restored, or his call with
   a recommendation. If nothing is his call, start building. Otherwise bring
   him those items and build after his answer.

## Critic

Fable at extra-high thinking, run outside the subagent tool (which can't set
its thinking level):
`omp -p --model anthropic/claude-fable-5-1:xhigh "<prompt>"`
It reads the brief, every round, the engineering notes and the real data,
and ends with `VERDICT: HAPPY` or `NOT HAPPY` plus must-fixes. Three critic
rounds at most before gate 2.

## Build

Each step is proven live before its commit, by its own builder. A fresh
tester presses every action once, in both themes, at the narrowest size and
on phone. `.gitignore` lands before the first commit.

## Paseo plugins

Mockups start from `paseo-mock-base/` in this repo (README first), with
Acme and live data both available. Tab rules (pushing, models, test agents,
public-repo hygiene) come from the dispatcher's tab brief.
