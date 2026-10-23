import type { Link } from "../shared/links";

/**
 * One sub-row of an unfolded row: `url` opens, `text` is what it shows (the bare URL's path, else
 * the variant's literal query and fragment), `lastAt` its newest mention (none for a bare URL
 * that was never mentioned on its own).
 */
export interface VariantRow {
  url: string;
  text: string;
  lastAt?: number;
}

/** A run of a sub-row's text: URL syntax, keys and paths are muted; `value` runs are query values and the fragment. */
export interface UrlPart {
  text: string;
  value: boolean;
}

/** The URL without its query string and fragment. Plain string work: React Native's `URL` can't set `search`. */
function withoutQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut < 0 ? url : url.slice(0, cut);
}

/** The path of a URL as written (`/observatory-design/post-anatomy.html`), `/` for none. */
function pathOf(url: string): string {
  return withoutQuery(url).replace(/^[a-z][a-z\d+.-]*:\/\/[^/]*/i, "") || "/";
}

/**
 * The sub-rows of a row with variants: the bare URL first, then the other variants newest first.
 * The bare URL is the variant without query or fragment when it was mentioned; else it is derived
 * from the newest variant, and a `/index.html` the row's key dropped (the webshare's `/dir/`) is
 * dropped from it too.
 */
export function variantRows(link: Link): VariantRow[] {
  const variants = link.variants;
  if (!variants?.length) return [];
  const bare = variants.find((variant) => !variant.query);
  let first: VariantRow;
  if (bare) first = { url: bare.url, text: pathOf(bare.url), lastAt: bare.lastAt };
  else {
    let url = withoutQuery(variants[0]!.url);
    if (url.endsWith("/index.html") && !link.key.endsWith("/index.html")) url = url.slice(0, -"index.html".length);
    first = { url, text: pathOf(url) };
  }
  const rest = variants.filter((variant) => variant !== bare).map((variant) => ({ url: variant.url, text: variant.query, lastAt: variant.lastAt }));
  return [first, ...rest];
}

/**
 * A variant's literal `?query#fragment` in runs: `?`, `&`, `=`, keys and `#` muted, each value
 * and the fragment not; adjacent runs of one kind are joined.
 */
export function queryParts(query: string): UrlPart[] {
  const parts: UrlPart[] = [];
  const push = (text: string, value: boolean) => {
    if (!text) return;
    const last = parts.at(-1);
    if (last && last.value === value) last.text += text;
    else parts.push({ text, value });
  };
  const hash = query.indexOf("#");
  const search = hash < 0 ? query : query.slice(0, hash);
  const body = search.startsWith("?") ? search.slice(1) : search;
  if (search.startsWith("?")) push("?", false);
  body.split("&").forEach((pair, index) => {
    if (index) push("&", false);
    const eq = pair.indexOf("=");
    if (eq < 0) return push(pair, false);
    push(pair.slice(0, eq + 1), false);
    push(pair.slice(eq + 1), true);
  });
  if (hash >= 0) {
    push("#", false);
    push(query.slice(hash + 1), true);
  }
  return parts;
}
