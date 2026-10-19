const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function localMidnight(ms: number): number {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * "just now", "5 min ago", "3 h ago" (same day, or under 6 h), then by local calendar day:
 * "yesterday", "4 d ago", "3 wk ago", "5 mo ago", "2 y ago".
 */
export function relativeTime(iso: string, now: number): string {
  const then = Date.parse(iso);
  const elapsed = Math.max(0, now - then);
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;
  // Rounded: a DST change makes one calendar day 23 or 25 hours long.
  const days = Math.max(0, Math.round((localMidnight(now) - localMidnight(then)) / DAY));
  if (days === 0 || elapsed < 6 * HOUR) return `${Math.floor(elapsed / HOUR)} h ago`;
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} d ago`;
  if (days < 60) return `${Math.floor(days / 7)} wk ago`;
  if (days < 365) return `${Math.floor(days / 30)} mo ago`;
  return `${Math.floor(days / 365)} y ago`;
}

/** Local "2026-10-19 12:41". Built by hand: Intl coverage differs between Hermes and browsers. */
export function absoluteTime(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** `cwd` shown relative to `folder` ("." for the folder itself); absolute when outside it. */
export function folderLabel(cwd: string, folder: string): string {
  if (cwd === folder) return ".";
  return cwd.startsWith(`${folder}/`) ? cwd.slice(folder.length + 1) : cwd;
}
