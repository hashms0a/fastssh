import { describe, expect, it } from "vitest";
import { searchOptions, statusText, stepOutcome, textMatches, type SearchQuery } from "./searchModel";

const q = (over: Partial<SearchQuery> = {}): SearchQuery => ({
  text: "b",
  cyclic: true,
  caseInsensitive: true,
  index: 0,
  count: 3,
  ...over,
});

describe("search toolbar model (R14)", () => {
  it("Cyclic off: Next stays on the last match and says No more matches", () => {
    const atLast = q({ cyclic: false, index: 2, count: 3 });
    expect(stepOutcome(atLast, "next")).toEqual({ kind: "stop" });
    expect(statusText(atLast, true)).toBe("No more matches");
    // Stepping back from the last match is still allowed.
    expect(stepOutcome(atLast, "prev")).toEqual({ kind: "go" });
  });

  it("Cyclic off: Previous stops at the first match too", () => {
    const atFirst = q({ cyclic: false, index: 0, count: 3 });
    expect(stepOutcome(atFirst, "prev")).toEqual({ kind: "stop" });
    expect(statusText(atFirst, true)).toBe("No more matches");
  });

  it("Cyclic on: both edges wrap", () => {
    expect(stepOutcome(q({ index: 2, count: 3 }), "next")).toEqual({ kind: "go" });
    expect(stepOutcome(q({ index: 0, count: 3 }), "prev")).toEqual({ kind: "go" });
  });

  it("an empty query or zero matches never calls the addon", () => {
    expect(stepOutcome(q({ text: "" }), "next")).toEqual({ kind: "empty" });
    expect(stepOutcome(q({ count: 0, index: -1 }), "next")).toEqual({ kind: "empty" });
    expect(statusText(q({ count: 0, index: -1 }), false)).toBe("Not found");
    expect(statusText(q({ count: 0, index: -1 }), true)).toBe("Not found");
  });

  it("Case-insensitive off: ECHO does not match echo", () => {
    expect(textMatches("ECHO", "echo hi", false)).toBe(false);
    expect(textMatches("ECHO", "echo hi", true)).toBe(true);
    expect(textMatches("Echo", "say Echo now", true)).toBe(true);
    expect(textMatches("", "anything", true)).toBe(false);
    // The flag reaches the addon as caseSensitive: !caseInsensitive.
    expect(searchOptions(q({ caseInsensitive: false })).caseSensitive).toBe(true);
    expect(searchOptions(q({ caseInsensitive: true })).caseSensitive).toBe(false);
  });

  it("the counter reads 3 / 12", () => {
    expect(statusText(q({ index: 2, count: 12 }), false)).toBe("3 / 12");
    expect(statusText(q({ text: "" }), false)).toBe("");
  });

  it("decorations are set so onDidChangeResults reports the index and count", () => {
    expect(searchOptions(q()).decorations.matchOverviewRuler).toBeTruthy();
    expect(searchOptions(q()).decorations.activeMatchColorOverviewRuler).toBeTruthy();
  });
});
