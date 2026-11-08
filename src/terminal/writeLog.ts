/**
 * Per-tab record of what the app wrote into its PTY, for the e2e specs only
 * (Stage 5 acceptance: "the password was written exactly once"). The map is
 * filled only in DEV and in Vite mode "e2e", so a release build never keeps
 * typed text in memory.
 */
const enabled = import.meta.env.DEV || import.meta.env.MODE === "e2e";
const MAX_PER_TAB = 200;

const logs = new Map<string, string[]>();

export function recordWrite(tabId: string, data: string): void {
  if (!enabled) return;
  const list = logs.get(tabId) ?? [];
  list.push(data);
  if (list.length > MAX_PER_TAB) list.shift();
  logs.set(tabId, list);
}

/** How many writes to this tab were exactly `data`. */
export function writeCount(tabId: string, data: string): number {
  return (logs.get(tabId) ?? []).filter((w) => w === data).length;
}

export function forgetWrites(tabId: string): void {
  logs.delete(tabId);
}
