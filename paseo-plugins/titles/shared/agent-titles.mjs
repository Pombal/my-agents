// Agent policy only: workspace naming can have its own policy and lifecycle later.
export function defaultTitle(prompt) {
  const line = prompt.split(/\r?\n/).map(line => line.trim()).find(Boolean);
  return line?.replace(/\s+/g, " ").slice(0, 60).trim() || null;
}

export function isDefaultTitle(title, prompt) {
  const expected = defaultTitle(prompt);
  return expected !== null && title === expected;
}

export function observeTitle(state, current) {
  if (state.initial === undefined) {
    if (current !== null) state.initial = current;
  } else if (state.initial !== current) state.renamed = true;
}

export function parseDecision(text) {
  const value = JSON.parse(text.trim().replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```$/, ""));
  if (value.action === "keep") return { action: "keep" };
  if (value.action !== "rename" || typeof value.title !== "string") throw new Error("Invalid title decision");
  const words = value.title.trim().split(/\s+/);
  if (words.length < 1 || words.length > 2 || !words.every(word => /^[\p{L}\p{N}][\p{L}\p{N}'’+.#-]*$/u.test(word))) {
    throw new Error("Title must contain one word, or two meaningful words");
  }
  const title = words.map(word => word[0].toLocaleUpperCase() + word.slice(1)).join(" ");
  if (title.length > 60) throw new Error("Title is too long");
  return { action: "rename", title };
}

export function conversationContext(items, maxChars = 12000) {
  const messages = items.filter(item => (item.type === "user_message" || item.type === "assistant_message") && item.text?.trim());
  // Bound each message so one verbose assistant cannot crowd out the newest
  // user request. Preserve each message's beginning and ending when shortened.
  return messages.slice(-16).map(item => {
    const text = item.text.length > 1500 ? `${item.text.slice(0, 750)}\n[…middle omitted…]\n${item.text.slice(-750)}` : item.text;
    return `${item.type === "user_message" ? "User" : "Assistant"}: ${text}`;
  }).join("\n\n").slice(-maxChars);
}

export function metadataAgent(title) {
  return /^(?:branch name|agent title|workspace (?:title|metadata)|checkout (?:title|metadata)) generator$/i.test(title ?? "");
}
