import { describe, expect, it } from "vitest";
import { addProse, listLinks, siteFor, type LinkMap } from "./links";

/** Each row's title and snippet for one assistant message (real replies from the Links chat). */
function snippets(text: string) {
  const links: LinkMap = new Map();
  addProse(links, { role: "assistant", text, at: 0 }, siteFor("/home/cx"));
  return listLinks(links).map(({ title, snippet }) => [title, snippet]);
}

describe("snippets", () => {
  it("take the link's own sentence, the link read as its title", () => {
    expect(
      snippets(
        "I added item 17 to `/home/cx/agentspace/index/.scratch/paseo-grievances/paseo-grievances.md:256-262`. No plugin code exists yet, so nothing was committed or pushed.",
      ),
    ).toEqual([["paseo-grievances.md", "I added item 17 to paseo-grievances.md."]]);
  });

  it("strip Markdown: list markers, bold and code spans", () => {
    expect(
      snippets(
        "- **Temp files:** my research scripts and data, 7.9 MB in `/home/cx/tmp-archive/mentioned-links/`. I'm keeping them for the build. The Paseo source copy `/home/cx/tmp-archive/paseo-v0.12.0/` is from yesterday and isn't mine.",
      ),
    ).toEqual([
      ["mentioned-links/", "Temp files: my research scripts and data, 7.9 MB in mentioned-links/."],
      ["paseo-v0.12.0/", "The Paseo source copy paseo-v0.12.0/ is from yesterday and isn't mine."],
    ]);
  });

  it("borrow the sentence before when the link's own says almost nothing, cut to about 120 characters", () => {
    const [[, snippet]] = snippets(
      "Decision recorded (not built yet): type filter chips in the popover. A chip shows only for a type that has links, so never a chip with 0. The whole chip bar shows only when the chat has at least two different types; otherwise it takes no space. Saved in `/home/cx/agentspace/index/.scratch/paseo-grievances/paseo-grievances.md:324`.",
    ) as [[string, string]];
    expect(snippet).toBe("…otherwise it takes no space. Saved in paseo-grievances.md.");
  });

  it("give an embed on its own line its caption, else the line above it, without repeating its title", () => {
    expect(
      snippets(
        "All 12 variants are at `http://axalon:8080/pages/mentioned-links-mocks/`, with a light/dark switch.\n\n![S1 grouped by tab](/home/cx/www/webshare/images/mentioned-links-s1-by-tab.png)\n**S1:** sidebar screen grouped by tab, folding groups, one line per link.",
      ),
    ).toEqual([
      ["S1 grouped by tab", "S1: sidebar screen grouped by tab, folding groups, one line per link."],
      ["mentioned-links-mocks", "All 12 variants are at mentioned-links-mocks, with a light/dark switch."],
    ]);
    expect(
      snippets(
        "Page: `http://axalon:8080/pages/mentioned-links-mocks-2/` (light/dark switch at the top).\n\n![S5](/home/cx/www/webshare/images/mentioned-links-2-s5.png)",
      )[0],
    ).toEqual(["S5", "Page: mentioned-links-mocks-2 (light/dark switch at the top)."]);
  });
});
