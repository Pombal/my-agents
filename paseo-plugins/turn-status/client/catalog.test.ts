import { describe, expect, test } from "vitest";
import { CATALOG_CSS, SPINNER_MARKUP } from "./catalog";

/** The keyframes of one @keyframes rule as [offset %, declarations] pairs. */
function keyframes(name: string): [number, string][] {
  const start = CATALOG_CSS.indexOf(`@keyframes ${name}{`);
  if (start < 0) throw new Error(`no @keyframes ${name}`);
  let depth = 0, end = start;
  for (let i = CATALOG_CSS.indexOf("{", start); i < CATALOG_CSS.length; i++) {
    if (CATALOG_CSS[i] === "{") depth++;
    else if (CATALOG_CSS[i] === "}" && --depth === 0) { end = i; break; }
  }
  const body = CATALOG_CSS.slice(CATALOG_CSS.indexOf("{", start) + 1, end);
  return [...body.matchAll(/([\d.%,\s]+)\{([^}]*)\}/g)].flatMap(([, offsets, declarations]) =>
    offsets!.split(",").map((offset) => [Number.parseFloat(offset), declarations!] as [number, string]));
}

/** Opacity at `t` % of a step-end animation: each keyframe's value holds until the next keyframe. */
function steppedOpacity(frames: [number, string][], t: number): number {
  let value = 0;
  for (const [offset, declarations] of frames) if (offset <= t) value = Number(/opacity:([\d.]+)/.exec(declarations)?.[1] ?? value);
  return value;
}

const copiesIn = (html: string) => html.match(/<i><\/i>/g)?.length ?? 0;
const SAMPLES = Array.from({ length: 10000 }, (_, k) => k / 100);

describe("flipbooks", () => {
  test.each([["morph", "spn-morph"], ["starburst", "spn-burst"]] as const)("%s shows exactly one copy at every moment, out and back", (id, name) => {
    const copies = copiesIn(SPINNER_MARKUP[id].html);
    const books = Array.from({ length: copies }, (_, j) => keyframes(`${name}${j}`));
    expect(CATALOG_CSS).not.toContain(`@keyframes ${name}${copies}{`);
    const slots = copies * 2;
    // Slot boundaries as written in the CSS (two decimals).
    const bounds = Array.from({ length: slots }, (_, k) => Number(((k * 100) / slots).toFixed(2)));
    for (const t of SAMPLES) {
      const shown = books.flatMap((book, j) => (steppedOpacity(book, t) === 1 ? [j] : []));
      // Slot k shows the shape sampled for it; slots k and slots-1-k share one.
      const slot = bounds.findLastIndex((bound) => bound <= t);
      expect({ t, shown }).toEqual({ t, shown: [Math.min(slot, slots - 1 - slot)] });
    }
  });

  test("morph copies get rounder from the first to the last (the 50% keyframe's circle)", () => {
    const radii = Array.from({ length: copiesIn(SPINNER_MARKUP.morph.html) }, (_, j) => {
      const match = new RegExp(`\\.spn-morph b i:nth-child\\(${j + 1}\\)\\{border-radius:calc\\(([\\d.]+)em \\+ ([\\d.]+)%\\)`).exec(CATALOG_CSS);
      return Number(match![2]);
    });
    expect(radii[0]).toBeGreaterThan(0);
    expect(radii.at(-1)).toBeLessThan(50);
    for (let j = 1; j < radii.length; j++) expect(radii[j]).toBeGreaterThan(radii[j - 1]!);
  });
});

describe("orbits behind and in front", () => {
  test.each(["spn-moon", "spn-elec"])("%s: exactly one of the two copies shows at every moment, the front one on the near half", (name) => {
    const front = keyframes(`${name}-f`), back = keyframes(`${name}-b`);
    for (const t of SAMPLES) expect(steppedOpacity(front, t) + steppedOpacity(back, t)).toBe(1);
    // The loop's near half is angles 0–180°: the first half of the cycle (sin > 0).
    expect(steppedOpacity(front, 25)).toBe(1);
    expect(steppedOpacity(back, 75)).toBe(1);
  });
});
