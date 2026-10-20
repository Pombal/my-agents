// One title decision per tab or workspace at a time. An automatic run is skipped
// while anything runs for that key; a manual run waits for an automatic one and
// then goes ahead (Stefan pressed Retitle, so he gets a new title), but a second
// manual run is refused with `busyMessage`.
/** @param {string} busyMessage */
export function exclusiveRuns(busyMessage) {
  /** @type {Map<string, { manual: boolean, done: Promise<unknown> }>} */
  const running = new Map();
  /** @param {string} key */
  const busy = key => running.has(key);
  /**
   * @template T
   * @param {string} key
   * @param {boolean} manual
   * @param {() => Promise<T>} work
   * @returns {Promise<T | null>}
   */
  async function run(key, manual, work) {
    for (let current; (current = running.get(key));) {
      if (!manual) return null;
      if (current.manual) throw new Error(busyMessage);
      await current.done.catch(() => {});
    }
    const entry = { manual, done: Promise.resolve().then(work) };
    running.set(key, entry);
    try { return await entry.done; } finally { if (running.get(key) === entry) running.delete(key); }
  }
  return { run, busy };
}
