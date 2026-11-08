/**
 * Pure search rules for the SearchToolbar (task 6.5, R14). The addon call and
 * the store live elsewhere, so the two behaviours the plan requires as
 * [unit] — Cyclic off stopping at the last match, Case-insensitive off
 * not matching across case — are testable without a terminal.
 */

export type SearchDirection = "next" | "prev";

export interface SearchQuery {
  /** Current text; "" means nothing to search for. */
  text: string;
  /** Default on (R14). */
  cyclic: boolean;
  /** Default on (R14). */
  caseInsensitive: boolean;
  /** Index of the active result from SearchAddon's onDidChangeResults, -1 = none. */
  index: number;
  /** Total matches reported by the addon. */
  count: number;
}

export type StepOutcome =
  /** Ask the addon for the next/previous match. */
  | { kind: "go" }
  /** Cyclic is off and this edge is reached: stay put, say "No more matches". */
  | { kind: "stop" }
  /** Nothing to search for, or no match at all. */
  | { kind: "empty" };

/**
 * xterm's SearchAddon always wraps, so Cyclic off is decided here: when the
 * active result is already the first (for prev) or the last (for next), the
 * toolbar does not call the addon and keeps the highlight where it is.
 */
export function stepOutcome(q: SearchQuery, dir: SearchDirection): StepOutcome {
  if (!q.text || q.count === 0 || q.index < 0) return { kind: "empty" };
  if (q.cyclic) return { kind: "go" };
  if (dir === "next" && q.index >= q.count - 1) return { kind: "stop" };
  if (dir === "prev" && q.index <= 0) return { kind: "stop" };
  return { kind: "go" };
}

export const noMoreMatches = "No more matches";
export const notFound = "Not found";

/** The counter text: "3 / 12", or the message for the empty/stopped case. */
export function statusText(q: SearchQuery, stopped: boolean): string {
  if (stopped) return q.count > 0 ? noMoreMatches : notFound;
  if (!q.text) return "";
  if (q.count === 0 || q.index < 0) return notFound;
  return `${q.index + 1} / ${q.count}`;
}

/** Options passed to findNext/findPrevious; decorations make results fire. */
export function searchOptions(q: SearchQuery) {
  return {
    caseSensitive: !q.caseInsensitive,
    decorations: {
      matchBackground: "#8b6914",
      matchBorder: "#d9b45c",
      matchOverviewRuler: "#d9b45c",
      activeMatchBackground: "#c98a1b",
      activeMatchBorder: "#ffe6a8",
      activeMatchColorOverviewRuler: "#ffe6a8",
    },
  };
}

/** Case rule used by the [unit] bullet: with the toggle off "ECHO" != "echo". */
export function textMatches(query: string, haystack: string, caseInsensitive: boolean): boolean {
  if (!query) return false;
  return caseInsensitive ? haystack.toLowerCase().includes(query.toLowerCase()) : haystack.includes(query);
}
