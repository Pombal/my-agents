import { describe, expect, it } from "vitest";
import { addProse, listLinks, siteFor, type LinkMap } from "./links";

const PAGE = "http://axalon:8080/observatory-design/post-anatomy.html";

/** The rows for messages given as [role, text, minute]. */
function rows(...messages: [role: "user" | "assistant", text: string, minute: number][]) {
  const links: LinkMap = new Map();
  for (const [role, text, minute] of messages) addProse(links, { role, text, at: minute * 60_000 }, siteFor("/home/cx"));
  return listLinks(links);
}

/**
 * Every mention of post-anatomy.html in chat f3046c55 (nilo-observatory, 2026-10-22) in transcript
 * order: [role, minute, query, link text]. Mentions of one minute came in one message.
 */
const OBSERVATORY: [role: "user" | "assistant", minute: number, query: string, text: string | null][] = [
  ["assistant", 747, "", null],
  ["assistant", 775, "?v=now&title=1", "now"],
  ["assistant", 775, "?v=card&title=1", "card"],
  ["assistant", 775, "?v=credit&title=1", "credit"],
  ["assistant", 775, "?v=byline&title=1", "byline"],
  ["assistant", 775, "?v=rule&title=1", "rule"],
  ["assistant", 775, "?v=tab&title=1", "tab"],
  ["assistant", 775, "?v=tree&title=1", "tree"],
  ["assistant", 788, "?v=tree&title=1", "tree"],
  ["assistant", 788, "?v=tree2&title=1", "tree2"],
  ["assistant", 788, "?v=tree3&title=1", "tree3"],
  ["assistant", 788, "?v=tree4&title=1", "tree4"],
  ["assistant", 788, "?v=tree5&title=1", "tree5"],
  ["assistant", 788, "?v=tabname&title=1", "tabname"],
  ["assistant", 788, "?v=card&title=1", "card"],
  ["assistant", 788, "?v=now&title=1", "now"],
  ["user", 808, "?v=tabname&pathpos=above&title=1&say=1&long=1&path=mid&src=github&files=list", null],
  ["user", 808, "?v=card&pathpos=below&title=1&say=1&long=1&path=mid&src=github&files=list", null],
  ["user", 808, "?v=tree3&pathpos=below&title=1&say=1&long=1&path=mid&src=github&files=list&head=block&body=1&theme=dark", null],
  ["assistant", 809, "?v=tree3&pathpos=below&title=1&say=1&long=1&path=mid&src=github&files=list&head=block&body=1&theme=dark&sep=line", null],
  ["assistant", 809, "?v=tree3&pathpos=below&title=1&say=1&long=1&path=mid&src=github&files=list&head=block&body=1&theme=dark&sep=space", null],
  ["assistant", 809, "?v=tabname&pathpos=above&sep=line&title=1&files=list", null],
  ["assistant", 809, "?v=card&pathpos=above&sep=line&title=1&files=list", null],
  ["assistant", 809, "?v=card&pathpos=below&sep=line&title=1&files=list", null],
  ["assistant", 811, "?v=tabname&pathpos=below&title=1&say=1&long=1&path=mid&src=github&files=list&head=block&body=1&theme=dark&sep=none", null],
  ["assistant", 811, "?v=tabname&pathpos=below&title=1&say=1&long=1&path=mid&src=github&files=list&head=block&body=1&theme=dark&sep=line", null],
  ["assistant", 811, "?v=tabname&pathpos=below&title=1&say=1&long=1&path=mid&src=github&files=list&head=block&body=1&theme=dark&sep=space", null],
];

describe("variants", () => {
  it("folds every post-anatomy.html variant of the observatory chat into one row, newest variant first", () => {
    const messages = new Map<string, { role: "user" | "assistant"; minute: number; parts: string[] }>();
    for (const [role, minute, query, text] of OBSERVATORY) {
      const id = `${role}:${minute}`;
      const message = messages.get(id) ?? { role, minute, parts: [] };
      message.parts.push(text ? `[${text}](${PAGE}${query})` : `${PAGE}${query}`);
      messages.set(id, message);
    }
    const [row, ...rest] = rows(...[...messages.values()].map(({ role, minute, parts }): [typeof role, string, number] => [role, parts.join("\n- "), minute]));
    expect(rest).toEqual([]);
    const sepSpace = `${PAGE}?v=tabname&pathpos=below&title=1&say=1&long=1&path=mid&src=github&files=list&head=block&body=1&theme=dark&sep=space`;
    expect(row).toMatchObject({ key: PAGE, kind: "web", title: "post-anatomy.html", where: "axalon:8080", url: sepSpace, lastAt: 811 * 60_000 });
    const variants = row!.variants!;
    expect(variants).toHaveLength(24);
    expect(variants[0]).toEqual({ url: sepSpace, query: sepSpace.slice(PAGE.length), count: 1, lastAt: 811 * 60_000 });
    expect(variants.at(-1)).toEqual({ url: PAGE, query: "", count: 1, lastAt: 747 * 60_000 });
    expect(variants.map((variant) => variant.lastAt)).toEqual([...variants.map((variant) => variant.lastAt)].sort((a, b) => b - a));
    expect(variants.find((variant) => variant.query === "?v=tree&title=1")).toEqual({
      url: `${PAGE}?v=tree&title=1`,
      query: "?v=tree&title=1",
      title: "tree",
      count: 2,
      lastAt: 788 * 60_000,
    });
  });

  it("ignores the fragment, a trailing slash, the default port and the host's case", () => {
    const [row, ...rest] = rows(["assistant", "Docs: https://Paseo.sh:443/docs/ then https://paseo.sh/docs", 1], ["assistant", "See https://paseo.sh/docs#install", 2]);
    expect(rest).toEqual([]);
    expect(row).toMatchObject({ key: "https://paseo.sh/docs", title: "docs", url: "https://paseo.sh/docs#install" });
    expect(row!.variants).toEqual([
      { url: "https://paseo.sh/docs#install", query: "#install", count: 1, lastAt: 2 * 60_000 },
      { url: "https://paseo.sh/docs", query: "", count: 2, lastAt: 60_000 },
    ]);
  });

  it("reads /dir/index.html as /dir/ on the webshare only, and keeps merging webshare paths with their URL", () => {
    const links = rows(
      ["assistant", "Mocks: http://axalon:8080/pages/btw-mocks/index.html", 1],
      ["assistant", "Same: http://axalon:8080/pages/btw-mocks/ and `~/www/webshare/pages/btw-mocks/`", 2],
      ["assistant", "Elsewhere https://docs.dev/guide/index.html and https://docs.dev/guide/", 3],
    );
    expect(links.map(({ key, variants }) => ({ key, variants: variants?.length }))).toEqual([
      { key: "https://docs.dev/guide/index.html", variants: undefined },
      { key: "https://docs.dev/guide", variants: undefined },
      { key: "http://axalon:8080/pages/btw-mocks", variants: undefined },
    ]);
  });

  it("emits no variants for a link mentioned twice identically", () => {
    const [row, ...rest] = rows(["user", "Is [the docs](https://paseo.sh/docs?tab=web) right?", 1], ["assistant", "Yes, [the docs](https://paseo.sh/docs?tab=web).", 2]);
    expect(rest).toEqual([]);
    expect(row).toMatchObject({ title: "the docs", url: "https://paseo.sh/docs?tab=web" });
    expect(row).not.toHaveProperty("variants");
  });

  it("lists the single variant too when asked (the links page merges them across tabs); files never have any", () => {
    const links: LinkMap = new Map();
    addProse(links, { role: "assistant", text: "Twice [the docs](https://paseo.sh/docs?tab=web) and `/home/cx/notes.md`", at: 60_000 }, siteFor("/home/cx"));
    addProse(links, { role: "assistant", text: "Again https://paseo.sh/docs?tab=web", at: 120_000 }, siteFor("/home/cx"));
    expect(listLinks(links, true).map(({ title, variants }) => [title, variants])).toEqual([
      ["the docs", [{ url: "https://paseo.sh/docs?tab=web", query: "?tab=web", title: "the docs", count: 2, lastAt: 120_000 }]],
      ["notes.md", undefined],
    ]);
  });

  it("keeps one link text all variants share, names the page when the text names a variant", () => {
    const shared = rows(["assistant", `[Post anatomy](${PAGE}?v=a) and [Post anatomy](${PAGE}?v=b)`, 1]);
    expect(shared.map(({ title, variants }) => [title, variants?.map((variant) => variant.title)])).toEqual([
      ["Post anatomy", ["Post anatomy", "Post anatomy"]],
    ]);
    expect(rows(["assistant", `[tree](${PAGE}?v=tree&title=1)`, 1]).map(({ title }) => title)).toEqual(["post-anatomy.html"]);
  });
});
