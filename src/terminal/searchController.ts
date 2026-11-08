import { searchOptions, stepOutcome, type SearchDirection } from "../lib/searchModel";
import { useAppStore } from "../store/useAppStore";
import { activeEntry, activeTabId } from "./activeTab";
import { focusTerminal } from "./terminalRegistry";

/**
 * Drives the SearchAddon for the active tab (task 6.5, R14). The rules are in
 * src/lib/searchModel.ts; this module only calls the addon and records what it
 * reported, so Ctrl+G / Ctrl+Shift+G and the toolbar buttons share one path.
 */

export function toggleSearch(): void {
  const st = useAppStore.getState();
  if (st.searchOpen) {
    closeSearch();
    return;
  }
  st.setSearchOpen(true);
  if (st.search.text) stepSearch("next");
}

/** Escape: close, clear the decorations, give the terminal the focus back. */
export function closeSearch(): void {
  useAppStore.getState().setSearchOpen(false);
  activeEntry()?.search.clearDecorations();
  const id = activeTabId();
  if (id) focusTerminal(id);
}

export function stepSearch(dir: SearchDirection): void {
  const st = useAppStore.getState();
  const entry = activeEntry();
  if (!st.searchOpen || !entry) return;
  const outcome = stepOutcome(st.search, dir);
  if (outcome.kind !== "go") {
    // Cyclic off at the edge (or nothing found): keep the highlight, say so.
    st.patchSearch({ stopped: true });
    return;
  }
  const options = searchOptions(st.search);
  if (dir === "next") entry.search.findNext(st.search.text, options);
  else entry.search.findPrevious(st.search.text, options);
  st.patchSearch({ stopped: false });
}

/** From the toolbar input and the two toggles: restart the scan from the top. */
export function applySearchText(text: string): void {
  useAppStore.getState().patchSearch({ text, index: -1, count: 0, stopped: false });
  const entry = activeEntry();
  if (!entry) return;
  entry.search.clearDecorations();
  if (!text) return;
  entry.search.findNext(text, searchOptions(useAppStore.getState().search));
}
