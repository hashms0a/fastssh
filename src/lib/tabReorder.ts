/**
 * Stage 11 (P2): tab reorder by drag and rename on a double-click. Both rules
 * are pure here, so a unit test covers them without a DOM. Titles live on the
 * tab object only - tabs are never written to disk, so a rename is gone at the
 * next start and nothing in `hosts.json` changes.
 */

/**
 * Move `draggedId` into the slot `targetId` holds: the dropped tab takes the
 * target's position and the others shift. Dragging right therefore lands it
 * just after the target, dragging left just before it. Returns a new array,
 * and a plain copy of `order` when nothing moves (same id, or either id is not
 * in the list - a drop from another host's notebook).
 */
export function moveOnto(order: readonly string[], draggedId: string, targetId: string): string[] {
  const next = [...order];
  if (draggedId === targetId) return next;
  const from = order.indexOf(draggedId);
  const to = order.indexOf(targetId);
  if (from < 0 || to < 0) return next;
  next.splice(from, 1);
  next.splice(to, 0, draggedId);
  return next;
}

/** Long titles are truncated in the tab bar; the store keeps at most this. */
export const MAX_TAB_TITLE = 64;

/**
 * A title the user typed: outer space gone, runs of whitespace and newlines
 * collapsed to one space, capped. Empty (or whitespace-only) keeps the
 * `fallback`, so pressing Enter on an empty field renames nothing.
 */
export function tabTitle(raw: string, fallback: string): string {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return fallback;
  return trimmed.length > MAX_TAB_TITLE ? trimmed.slice(0, MAX_TAB_TITLE) : trimmed;
}
