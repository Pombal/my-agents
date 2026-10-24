# Example Card-game Spec Review

Synthetic illustration of the `spec-review` methodology and a scoring-verification pitfall.

## Context
- Repo: `github.com/acme/example-client` (synthetic), `example-feature` branch, `docs/spec/`.
- Task: review the combined spec as a single coherent document.
- Artifact: `<notes-dir>/example-spec-review.md`

## Fetching a private repo's docs
Unauthenticated `curl`/browser → 404. The authenticated `gh` CLI (logged in as `choephix`) works:

```bash
# list files in a dir
gh api "repos/acme/example-client/contents/docs/spec?ref=example-feature" --jq '.[].path'
# fetch one file (content is base64)
gh api "repos/acme/example-client/contents/docs/spec/overview.md?ref=example-feature" \
  --jq '.content' | base64 -d
# loop all to a temp dir
mkdir -p /tmp/example-spec && cd /tmp/example-spec
for f in overview architecture rules; do
  gh api "repos/acme/example-client/contents/docs/spec/$f.md?ref=example-feature" \
    --jq '.content' | base64 -d > "$f.md"
done
wc -l *.md   # sanity check
```

## The self-correction (key lesson)
- **Potential false finding:** deriving "No Trumps = 250" by assuming only card points double.
- **Required check:** consult authoritative rules before reporting a scoring error.
- **Grounded result:** 260 is correct: card points (120→240) and Last10 (10→20) double; Capot does not. Retract any earlier claim to the contrary explicitly.

## Example findings shape
**Correct against official rules:** card points, strength order, 3-2-3 deal, free bidding, contract hierarchy, undertrump-not-mandatory (Bulgarian, not French), capot-can't-end, capot=+90, declarations independent by type, carré values, BeLot, Outside/Inside/Hanging, 151 target, counter-clockwise.

**Synthetic gaps (under-documented, not wrong):** a missing derivation of scoring totals; conflicting identifier schemas; inconsistent names for the same domain concept.

---

## Bulgarian Belot — condensed rules (knowledge bank)

Sources: **belot.bg** unified rules (`belot.bg/en/rules-belot/`, de-facto Bulgarian standard) and **pagat.com** (`/jass/belote.html`, French Belote reference). No single governing-body rulebook exists; these are the dominant published standards.

### Card points
| Rank | Trump | Non-trump |
|---|---|---|
| J | 20 | 2 |
| 9 | 14 | 0 |
| A | 11 | 11 |
| 10 | 10 | 10 |
| K | 4 | 4 |
| Q | 3 | 3 |
| 8 | 0 | 0 |
| 7 | 0 | 0 |

### Strength order
- Trump / All Trumps: J > 9 > A > 10 > K > Q > 8 > 7
- Plain / No Trumps: A > 10 > K > Q > J > 9 > 8 > 7

### Point totals (incl Last10)
- Suit (trump color): **162**
- No Trumps: **260** (card points AND Last10 doubled; Capot NOT doubled)
- All Trumps: **258**

### Bidding
- Free bidding (Bulgarian/Vist style) — not the French take-the-turn-up two-round model.
- Hierarchy low→high: ♣ < ♦ < ♥ < ♠ < No Trumps < All Trumps.
- Double (×2, by opposing team when multiplier is 1) / ReDouble (×4, by committed team when multiplier is 2).
- 3 passes after an active contract → finalized. 4 passes with no contract → AllPass / redeal (rotate dealer).
- Higher bid resets multiplier to 1 and clears Double/ReDouble metadata.

### Declarations (none in No Trumps)
- Sequence: Tierce(3)=20, Quarte(4)=50, Quint(5)=100. Sequence order 7<8<9<10<J<Q<K<A. Longer wins; equal length → higher top card; equal → both invalid.
- Carré: 4J=200, 4×9=150, 4×A/10/K/Q=100; 4×7 and 4×8 invalid.
- BeLot: K+Q of trump = 20, always scores, announced when first card of the pair is played. In All Trumps, one K+Q pair of one chosen suit (do not stack multiple).
- Sequence vs Sequence and Carré vs Carré resolve **independently** (Bulgarian); a Sequence and a Carré do NOT cancel each other.

### Trick play (Bulgarian divergences)
- Follow suit; raise on trump lead; trump if void and opponent winning; overtrump if possible.
- **Undertrump is NOT mandatory** if unable to overtrump (Bulgarian; French Belote requires *pisser*).
- Partner-winning exception: may discard any card.

### Scoring outcomes
- **Outside** (committed > defenders): both score own rounded points.
- **Inside / dedans** (committed < defenders): defenders take all rounded points; committed 0.
- **Hanging** (equal): defenders score; committed points carry (HangPoints) to next non-hanging deal.
- **Double/ReDouble:** winner-takes-all, ×2/×4; ALL premiums incl. Capot are multiplied (opposite of NT, where Capot is the one thing NOT doubled). Equal under double/redouble → HangAgain (all multiplied points hang).
- **Capot:** +90, and **cannot end the game** (Bulgarian rule) — deal another round.
- **Last10:** +10 for winning trick 8 (doubled to +20 under NT).
- Target: 151; counter-clockwise; player to dealer's right opens.

### Bulgarian-vs-French divergences (flag deliberately in any Belot spec)
1. Undertrump not mandatory (French: mandatory).
2. Declarations independent by type (French: carré beats sequence).
3. Capot cannot end the game (French: no such rule).
4. Free bidding (French: take-the-turn-up, two rounds).
5. NT doubles card points + Last10, but not Capot.
