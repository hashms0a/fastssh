/**
 * Task 12.4: render counters, so an e2e spec can prove that PTY output
 * re-renders only the affected tab-bar item and never the sidebar list.
 *
 * Compiled away in a release build (`import.meta.env.DEV` is false and the
 * mode is not "e2e"), exactly like `src/lib/testHook.ts`; the release `dist/`
 * contains no counter calls.
 */
const enabled = import.meta.env.DEV || import.meta.env.MODE === "e2e";
const counts = new Map<string, number>();

export function countRender(name: string): void {
  if (!enabled) return;
  counts.set(name, (counts.get(name) ?? 0) + 1);
}

export const renderCount = (name: string): number => counts.get(name) ?? 0;

export function resetRenderCounts(): void {
  counts.clear();
}
