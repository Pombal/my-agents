import { describe, expect, it } from "vitest";
import { extractMentions } from "./extract";
import { addProse, listLinks, siteFor, type LinkMap } from "./links";

const HOME = "/home/cx";
/** Top-level folders that exist on the daemon machine, plus one path with spaces. */
const ON_DISK = new Set(["/home", "/tmp", "/mnt", "/mnt/obsidian-vault/Infra - Ofis"]);
const options = { home: HOME, exists: (file: string) => ON_DISK.has(file) };
const assistant = (text: string) => extractMentions(text, "assistant", options);

/** The popover rows for messages given as [role, text, minute]. */
function rows(...messages: [role: "user" | "assistant", text: string, minute: number][]) {
  const links: LinkMap = new Map();
  for (const [role, text, minute] of messages) addProse(links, { role, text, at: minute * 60_000 }, siteFor(HOME));
  return listLinks(links);
}

describe("extractMentions on real assistant prose", () => {
  it("keeps a line range and drops the sentence's period", () => {
    expect(
      assistant(
        "The source is `/home/cx/agentspace/index/.scratch/paseo-grievances/paseo-grievances.md:24-37`. Effort runs from 1",
      ),
    ).toEqual([{ kind: "path", target: "/home/cx/agentspace/index/.scratch/paseo-grievances/paseo-grievances.md", line: ":24-37" }]);
  });

  it("takes image embeds with their alt as the title", () => {
    expect(assistant("![Mock A](/home/cx/www/webshare/images/btw-mock-a.png)\n![Mock B](~/www/webshare/images/btw-mock-b.png)")).toEqual([
      { kind: "path", target: "/home/cx/www/webshare/images/btw-mock-a.png", title: "Mock A" },
      { kind: "path", target: "/home/cx/www/webshare/images/btw-mock-b.png", title: "Mock B" },
    ]);
  });

  it("trims trailing punctuation and an unbalanced paren from bare URLs, keeps backticked ones whole", () => {
    expect(
      assistant(
        "on a page you can open in the browser, `http://axalon:8080/pages/past-sessions-mocks/`. Also see http://axalon:8080/pages/btw-mocks/index.html. (and https://github.com/getpaseo/paseo/pull/12), done",
      ).map((mention) => mention.target),
    ).toEqual([
      "http://axalon:8080/pages/past-sessions-mocks/",
      "http://axalon:8080/pages/btw-mocks/index.html",
      "https://github.com/getpaseo/paseo/pull/12",
    ]);
  });

  it("keeps a URL's own balanced parentheses", () => {
    expect(assistant("See https://en.wikipedia.org/wiki/Rust_(programming_language).").map((mention) => mention.target)).toEqual([
      "https://en.wikipedia.org/wiki/Rust_(programming_language)",
    ]);
  });

  it("drops placeholders, example hosts and harness URIs", () => {
    expect(
      assistant(
        "Each has `~/workspace/my-agents/paseo-plugins/<id>/` and `~/.paseo/agents/{cwd}/x.json`, `$PKG/client/dist/index.d.ts`, `/home/cx/…/foo.ts`, `~/notes/*.md`, https://example.com/x, [notes](local://notes.md), artifact://12 and `agent://Main`.",
      ),
    ).toEqual([]);
  });

  it("skips fenced code blocks but not the prose around them", () => {
    expect(
      assistant("Run this:\n```bash\npaseo plugin install /home/cx/workspace/x\ncurl http://axalon:8080/a.png\n```\nThen open `~/workspace/y/OVERVIEW.md`."),
    ).toEqual([{ kind: "path", target: "/home/cx/workspace/y/OVERVIEW.md" }]);
  });

  it("ignores slash commands, API routes, commands in backticks and relative paths", () => {
    expect(assistant("Type `/btw` or call `/v1/chat/completions`; `cd /home/cx && ls`; `server/list.ts:59-71`.")).toEqual([]);
  });

  it("accepts a backticked path with spaces only when it exists", () => {
    expect(assistant("`/mnt/obsidian-vault/Infra - Ofis` and `/home/cx/a b`").map((mention) => mention.target)).toEqual([
      "/mnt/obsidian-vault/Infra - Ofis",
    ]);
  });

  it("strips OMP prose records and closed wrappers from assistant text", () => {
    expect(
      assistant(
        "Read it [ran read /home/cx/x.md; recover: artifact://0:3-40] and <system-notice>see `/home/cx/y.md`</system-notice> then `~/z.md`.",
      ),
    ).toEqual([{ kind: "path", target: "/home/cx/z.md" }]);
  });

  it("strips harness wrappers from user text, open ones to the end", () => {
    expect(
      extractMentions(
        'Check http://axalon:8080/pages/a.html <paseo-system version="1" kind="agent-message">open `/home/cx/secret.md`',
        "user",
        options,
      ).map((mention) => mention.target),
    ).toEqual(["http://axalon:8080/pages/a.html"]);
  });

  it("uses Markdown link text as the title and reads GitHub-style line anchors on paths", () => {
    expect(assistant("[the brief](/home/cx/agentspace/index/brief.md#L12-L20) and [**PR**](https://github.com/a/b/pull/3)")).toEqual([
      { kind: "path", target: "/home/cx/agentspace/index/brief.md", line: ":12-20", title: "the brief" },
      { kind: "url", target: "https://github.com/a/b/pull/3", title: "PR" },
    ]);
  });
});

describe("popover rows", () => {
  it("maps webshare paths to axalon:8080 and merges them with the same URL", () => {
    const links = rows(
      ["assistant", "![Mock A](/home/cx/www/webshare/images/btw-mock-a.png)", 1],
      ["assistant", "Same picture: http://axalon:8080/images/btw-mock-a.png", 5],
      ["assistant", "Page: `~/www/webshare/pages/tab-dots-mocks/wave.html`", 3],
    );
    expect(links.map(({ kind, title, url, lastAt }) => ({ kind, title, url, lastAt }))).toEqual([
      { kind: "image", title: "Mock A", url: "http://axalon:8080/images/btw-mock-a.png", lastAt: 5 * 60_000 },
      { kind: "web", title: "wave.html", url: "http://axalon:8080/pages/tab-dots-mocks/wave.html", lastAt: 3 * 60_000 },
    ]);
  });

  it("files copy the path with the newest line suffix; images outside the webshare are files", () => {
    const links = rows(
      ["assistant", "`/home/cx/workspace/p/server/list.ts:59-71`", 1],
      ["user", "what about `~/workspace/p/server/list.ts`?", 2],
      ["assistant", "![Before](/home/cx/workspace/p/screenshots/before.webp)", 3],
    );
    expect(links.map(({ kind, title, where, copy, glyph }) => ({ kind, title, where, copy, glyph }))).toEqual([
      { kind: "file", title: "Before", where: "~/workspace/p/screenshots", copy: "/home/cx/workspace/p/screenshots/before.webp", glyph: "Image" },
      { kind: "file", title: "list.ts", where: "~/workspace/p/server", copy: "/home/cx/workspace/p/server/list.ts:59-71", glyph: "FileCode" },
    ]);
  });

  it("titles URLs by their last segment and shows the host", () => {
    const links = rows(["assistant", "https://github.com/getpaseo/paseo/pull/12 and https://paseo.sh/docs/plugins/reference", 1]);
    expect(links.map(({ title, where }) => ({ title, where }))).toEqual([
      { title: "pull/12", where: "github.com" },
      { title: "reference", where: "paseo.sh" },
    ]);
  });
});
