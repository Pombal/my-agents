import { describe, expect, it } from "vitest";
import { absoluteTime, folderLabel, relativeTime } from "./format";

// Local wall-clock times, so the expectations hold in any time zone.
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
const iso = (ms: number) => new Date(ms).toISOString();

describe("relativeTime", () => {
  const now = at(19, 13, 20);

  it("uses minutes and hours for recent activity", () => {
    expect(relativeTime(iso(now - 59_000), now)).toBe("just now");
    expect(relativeTime(iso(at(19, 13, 15)), now)).toBe("5 min ago");
    expect(relativeTime(iso(at(19, 1, 0)), now)).toBe("12 h ago");
    // Before midnight but under 6 h ago still reads as hours.
    expect(relativeTime(iso(at(18, 23, 0)), at(19, 2, 0))).toBe("3 h ago");
  });

  it("counts calendar days, so the day before yesterday is not 'yesterday'", () => {
    expect(relativeTime(iso(at(18, 9, 0)), now)).toBe("yesterday");
    expect(relativeTime(iso(at(17, 19, 14)), now)).toBe("2 d ago");
    expect(relativeTime(iso(at(1, 12, 0)), now)).toBe("2 wk ago");
    expect(relativeTime(iso(new Date(2026, 6, 19).getTime()), now)).toBe("3 mo ago");
    expect(relativeTime(iso(new Date(2024, 6, 19).getTime()), now)).toBe("2 y ago");
  });

  it("treats clock skew into the future as now", () => {
    expect(relativeTime(iso(now + 10_000), now)).toBe("just now");
  });
});

describe("absoluteTime", () => {
  it("prints local date and minute", () => {
    expect(absoluteTime(iso(at(9, 7, 5)))).toBe("2026-10-09 07:05");
  });
});

describe("folderLabel", () => {
  it("shows subfolders relative to the listed folder and others in full", () => {
    expect(folderLabel("/w/index", "/w/index")).toBe(".");
    expect(folderLabel("/w/index/.scratch/a", "/w/index")).toBe(".scratch/a");
    expect(folderLabel("/w/indexer", "/w/index")).toBe("/w/indexer");
  });
});
