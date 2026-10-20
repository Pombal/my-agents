import { describe, expect, test } from "vitest";
import { isLightText } from "./model";

describe("isLightText", () => {
  // Plugin themes may use short hex (Paseo's own fixtures use "#fff"); the phone's running-dot
  // colour used to read "#fff" as dark text and pick the light-theme blue on dark themes.
  test.each([
    ["#fff", true],
    ["#FFFFFF", true],
    ["#f9f8fbcc", true],
    ["rgb(249, 248, 251)", true],
    ["rgba(250, 250, 250, 0.9)", true],
    ["#000", false],
    ["#1a1a1e", false],
    ["rgb(26, 26, 30)", false],
  ])("%s → %s", (color, light) => {
    expect(isLightText(color)).toBe(light);
  });
});
