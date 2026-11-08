/**
 * Task 12.5: the sidebar's keyboard path (R22). Arrow keys move the selection
 * through the rows that are actually rendered (collapsed groups contribute
 * none), Home/End jump to the ends, Enter connects the focused host, and
 * Space selects without connecting. Pure, so the matrix is unit-proven.
 */
export type SidebarKey = "ArrowUp" | "ArrowDown" | "Home" | "End" | "Enter" | " " | string;

export type SidebarAction = { type: "focus"; index: number } | { type: "activate"; index: number } | null;

/** `index` is the row's position in the rendered list, -1 when unknown. */
export function sidebarAction(key: SidebarKey, index: number, count: number): SidebarAction {
  if (count === 0 || index < 0) return null;
  switch (key) {
    case "ArrowDown":
      return { type: "focus", index: Math.min(count - 1, index + 1) };
    case "ArrowUp":
      return { type: "focus", index: Math.max(0, index - 1) };
    case "Home":
      return { type: "focus", index: 0 };
    case "End":
      return { type: "focus", index: count - 1 };
    case "Enter":
    case " ":
      return { type: "activate", index };
    default:
      return null;
  }
}
