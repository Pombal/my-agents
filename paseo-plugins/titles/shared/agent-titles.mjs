// Agent-tab naming policy, pure and runtime-free. Workspace titles would get a
// sibling module with their own rules; nothing here assumes agents are the only target.

// Mirrors Paseo 0.11.4's provisional agent title (create-agent-title.js):
// first nonblank prompt line, whitespace collapsed, clamped to 60 characters.
export function defaultTitle(prompt) {
  const line = prompt.split(/\r?\n/).map(part => part.trim()).find(Boolean);
  return line?.replace(/\s+/g, " ").slice(0, 60).trim() || null;
}

// Labels Titles keeps on each agent. A title is Titles' to manage only while it
// equals one of them (or, at the first reply, Paseo's placeholder); any other
// name was chosen by hand and is never changed automatically.
export const LABEL_NAMED = "titles.named"; // the title Titles chose
export const LABEL_UNNAMED = "titles.unnamed"; // Paseo's placeholder, still waiting for a subject

export function titleOwnership(title, labels, placeholder = null) {
  if (!title) return "hand";
  if (title === labels?.[LABEL_NAMED]) return "named";
  if (title === placeholder || title === labels?.[LABEL_UNNAMED]) return "unnamed";
  return "hand";
}

// Another tab of the same workspace as Haiku sees it: a title Titles chose goes
// in bare, a placeholder or a hand-chosen name with a note. `promptLines` are the
// sibling's first-prompt lines (defaultTitle of its opening user messages).
export function siblingEntry(title, labels, promptLines = []) {
  if (!title) return null;
  const ownership = titleOwnership(title, labels, promptLines.includes(title) ? title : null);
  if (ownership === "named") return title;
  return { title, note: ownership === "unnamed" ? "placeholder: first prompt line, not a title" : "named by hand" };
}

const WORD = /^[\p{L}\p{N}][\p{L}\p{N}'’+.#-]*$/u;

// A title in our own format: one word, or two, made of plain word characters.
export function isShortTitle(title) {
  const words = title?.trim().split(/\s+/) ?? [];
  return words.length >= 1 && words.length <= 2 && words.every(word => WORD.test(word));
}

// Model answer → { kind: "keep" } | { kind: "rename", title }. Anything else throws;
// over-long or decorated titles are rejected rather than silently truncated.
export function parseDecision(text) {
  const json = text.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  let value;
  try { value = JSON.parse(json); } catch { throw new Error(`Model answered with something other than JSON: ${text.trim().slice(0, 80)}`); }
  if (value?.keep === true) return { kind: "keep" };
  const raw = typeof value?.title === "string" ? value.title.trim().replace(/[.]$/, "") : "";
  if (!isShortTitle(raw)) throw new Error(`Model suggested an unusable title: ${JSON.stringify(value?.title ?? null)}`);
  // Title Case without flattening identifiers: "dark mode" → "Dark Mode", but iOS, eBPF and OAuth stay as written.
  const title = raw.split(/\s+/).map(word => word === word.toLocaleLowerCase() ? word[0].toLocaleUpperCase() + word.slice(1) : word).join(" ");
  return { kind: "rename", title };
}

// Each message keeps its beginning and end, so one long reply stays bounded.
const MAX_MESSAGE = 1200;

// Provider-neutral excerpt for the model. Tool calls, reasoning and plugin
// items are dropped; one turn's assistant messages merge into a single bounded
// entry, so a busy agentic turn cannot push the user's request out of view.
export function conversationContext(items, maxMessages = 12) {
  const messages = [];
  for (const item of items) {
    if ((item.type !== "user_message" && item.type !== "assistant_message") || !item.text?.trim()) continue;
    const previous = messages.at(-1);
    if (item.type === "assistant_message" && previous?.role === "Assistant") previous.text += `\n${item.text.trim()}`;
    else messages.push({ role: item.type === "user_message" ? "User" : "Assistant", text: item.text.trim() });
  }
  return messages.slice(-maxMessages)
    .map(({ role, text }) => `${role}: ${text.length > MAX_MESSAGE ? `${text.slice(0, MAX_MESSAGE / 2)}\n[…]\n${text.slice(-MAX_MESSAGE / 2)}` : text}`)
    .join("\n\n");
}
