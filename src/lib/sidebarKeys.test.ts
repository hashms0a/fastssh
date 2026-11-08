import { describe, expect, it } from "vitest";
import { sidebarAction } from "./sidebarKeys";

describe("sidebarAction (task 12.5 keyboard path)", () => {
  it("arrow keys move the selection and clamp at both ends", () => {
    expect(sidebarAction("ArrowDown", 0, 3)).toEqual({ type: "focus", index: 1 });
    expect(sidebarAction("ArrowDown", 2, 3)).toEqual({ type: "focus", index: 2 });
    expect(sidebarAction("ArrowUp", 1, 3)).toEqual({ type: "focus", index: 0 });
    expect(sidebarAction("ArrowUp", 0, 3)).toEqual({ type: "focus", index: 0 });
  });

  it("Home and End jump to the first and last rendered row", () => {
    expect(sidebarAction("Home", 4, 6)).toEqual({ type: "focus", index: 0 });
    expect(sidebarAction("End", 4, 6)).toEqual({ type: "focus", index: 5 });
  });

  it("Enter and Space activate the focused row", () => {
    expect(sidebarAction("Enter", 2, 3)).toEqual({ type: "activate", index: 2 });
    expect(sidebarAction(" ", 2, 3)).toEqual({ type: "activate", index: 2 });
  });

  it("other keys, an unknown row and an empty list do nothing", () => {
    expect(sidebarAction("a", 1, 3)).toBeNull();
    expect(sidebarAction("ArrowDown", -1, 3)).toBeNull();
    expect(sidebarAction("Enter", 0, 0)).toBeNull();
  });
});
