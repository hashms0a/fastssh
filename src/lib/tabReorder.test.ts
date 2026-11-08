import { describe, expect, it } from "vitest";
import { MAX_TAB_TITLE, moveOnto, tabTitle } from "./tabReorder";

describe("moveOnto (Stage 11 tab reorder)", () => {
  it("moves a tab backwards into the target's slot", () => {
    expect(moveOnto(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
  });

  it("moves a tab forwards into the target's slot at the end", () => {
    expect(moveOnto(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
    expect(moveOnto(["a", "b", "c"], "b", "c")).toEqual(["a", "c", "b"]);
  });

  it("leaves the order alone for a drop on itself", () => {
    expect(moveOnto(["a", "b"], "b", "b")).toEqual(["a", "b"]);
  });

  it("leaves the order alone when an id is not in the list", () => {
    expect(moveOnto(["a", "b"], "zz", "a")).toEqual(["a", "b"]);
    expect(moveOnto(["a", "b"], "a", "zz")).toEqual(["a", "b"]);
  });

  it("returns a new array and does not touch the input", () => {
    const order = ["a", "b", "c"];
    const next = moveOnto(order, "c", "a");
    expect(next).not.toBe(order);
    expect(order).toEqual(["a", "b", "c"]);
  });
});

describe("tabTitle (Stage 11 tab rename)", () => {
  it("trims and collapses runs of whitespace", () => {
    expect(tabTitle("  build   box  ", "Localhost")).toBe("build box");
  });

  it("turns a newline into a space so a title stays one line", () => {
    expect(tabTitle("a\nb", "Localhost")).toBe("a b");
  });

  it("keeps the fallback for an empty or whitespace-only title", () => {
    expect(tabTitle("", "item2")).toBe("item2");
    expect(tabTitle("   ", "item2")).toBe("item2");
  });

  it("caps a long title", () => {
    expect(tabTitle("x".repeat(200), "item2")).toHaveLength(MAX_TAB_TITLE);
  });
});
