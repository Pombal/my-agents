import { describe, expect, it } from "vitest";
import type { Link, LinkVariant } from "../shared/links";
import { queryParts, variantRows } from "./variants";

const variant = (url: string, lastAt: number): LinkVariant => {
  const cut = url.search(/[?#]/);
  return { url, query: cut < 0 ? "" : url.slice(cut), count: 1, lastAt };
};
const link = (key: string, variants: LinkVariant[]): Link => ({ key, kind: "web", title: "x", where: "host", glyph: "Globe", url: variants[0]!.url, lastAt: variants[0]!.lastAt, variants });

describe("variant rows", () => {
  it("put the bare URL first, derived from the newest variant when it was never mentioned on its own", () => {
    const row = link("https://site.dev/docs/page.html", [variant("https://site.dev/docs/page.html?v=tree&title=1#notes", 9), variant("https://site.dev/docs/page.html?v=card", 4)]);
    expect(variantRows(row)).toEqual([
      { url: "https://site.dev/docs/page.html", text: "/docs/page.html" },
      { url: "https://site.dev/docs/page.html?v=tree&title=1#notes", text: "?v=tree&title=1#notes", lastAt: 9 },
      { url: "https://site.dev/docs/page.html?v=card", text: "?v=card", lastAt: 4 },
    ]);
  });

  it("use the mentioned bare URL, with its time, first even when it is not the newest", () => {
    const row = link("https://site.dev/page", [variant("https://site.dev/page#install", 9), variant("https://site.dev/page", 5), variant("https://site.dev/page?x=1", 2)]);
    expect(variantRows(row).map((sub) => [sub.text, sub.lastAt])).toEqual([
      ["/page", 5],
      ["#install", 9],
      ["?x=1", 2],
    ]);
  });

  it("drop a webshare `index.html` the row's key dropped, and keep one the key kept", () => {
    const webshare = link("http://axalon:8080/pages/mocks", [variant("http://axalon:8080/pages/mocks/index.html?f=2", 9), variant("http://axalon:8080/pages/mocks/?f=1", 3)]);
    expect(variantRows(webshare)[0]).toEqual({ url: "http://axalon:8080/pages/mocks/", text: "/pages/mocks/" });
    const other = link("https://site.dev/index.html", [variant("https://site.dev/index.html?a=1", 9), variant("https://site.dev/index.html?a=2", 3)]);
    expect(variantRows(other)[0]).toEqual({ url: "https://site.dev/index.html", text: "/index.html" });
  });
});

describe("query parts", () => {
  it("split a literal query into muted syntax and keys and plain values, the fragment a value", () => {
    expect(queryParts("?v=tree3&pathpos=below&flag&empty=#notes")).toEqual([
      { text: "?v=", value: false },
      { text: "tree3", value: true },
      { text: "&pathpos=", value: false },
      { text: "below", value: true },
      { text: "&flag&empty=#", value: false },
      { text: "notes", value: true },
    ]);
  });

  it("keep a value's own `=` and a fragment-only variant", () => {
    expect(queryParts("?q=a=b")).toEqual([
      { text: "?q=", value: false },
      { text: "a=b", value: true },
    ]);
    expect(queryParts("#install")).toEqual([
      { text: "#", value: false },
      { text: "install", value: true },
    ]);
  });
});
