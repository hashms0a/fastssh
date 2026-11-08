import { useEffect, useRef } from "react";
import { statusText } from "../lib/searchModel";
import { strings } from "../lib/strings";
import { useAppStore } from "../store/useAppStore";
import { activeEntry } from "../terminal/activeTab";
import { applySearchText, closeSearch, stepSearch } from "../terminal/searchController";

/**
 * Search toolbar (task 6.5, R14). Ctrl+Shift+F toggles it, Ctrl+G /
 * Ctrl+Shift+G step through the results, Escape closes it, clears the
 * decorations and hands focus back to the terminal. The counter comes from
 * SearchAddon's onDidChangeResults, which only fires when decorations are set
 * (see src/lib/searchModel.ts).
 */
export function SearchToolbar() {
  const search = useAppStore((s) => s.search);
  const patchSearch = useAppStore((s) => s.patchSearch);
  const tabId = useAppStore((s) => (s.selectedHostId ? (s.activeTabByHost[s.selectedHostId] ?? null) : null));
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, []);

  useEffect(() => {
    const entry = activeEntry();
    if (!entry) return;
    const unlisten = entry.search.onDidChangeResults((ev) =>
      patchSearch({ index: ev.resultIndex, count: ev.resultCount, stopped: false }),
    );
    return () => unlisten.dispose();
  }, [tabId, patchSearch]);

  const toggle = (key: "cyclic" | "caseInsensitive") => {
    patchSearch({ [key]: !search[key], stopped: false });
    applySearchText(search.text);
  };

  return (
    <div
      data-testid="search-toolbar"
      className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-alt)] px-2 py-1 text-sm"
    >
      <input
        ref={input}
        data-testid="search-input"
        type="text"
        value={search.text}
        placeholder={strings.searchPlaceholder}
        className="min-w-40 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-0.5 text-sm outline-none focus:border-[var(--accent)]"
        onChange={(e) => applySearchText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            closeSearch();
          }
        }}
      />
      <span data-testid="search-count" className="min-w-14 tabular-nums text-[var(--muted)]">
        {statusText(search, search.stopped)}
      </span>
      <button
        type="button"
        data-testid="search-prev"
        className="rounded px-2 py-0.5 hover:bg-[var(--bg)]"
        onClick={() => stepSearch("prev")}
      >
        {strings.searchPrevious}
      </button>
      <button
        type="button"
        data-testid="search-next"
        className="rounded px-2 py-0.5 hover:bg-[var(--bg)]"
        onClick={() => stepSearch("next")}
      >
        {strings.searchNext}
      </button>
      <label className="flex items-center gap-1 text-[var(--muted)]">
        <input data-testid="search-cyclic" type="checkbox" checked={search.cyclic} onChange={() => toggle("cyclic")} />
        {strings.searchCyclic}
      </label>
      <label className="flex items-center gap-1 text-[var(--muted)]">
        <input
          data-testid="search-case"
          type="checkbox"
          checked={search.caseInsensitive}
          onChange={() => toggle("caseInsensitive")}
        />
        {strings.searchCase}
      </label>
      <button
        type="button"
        data-testid="search-close"
        aria-label={strings.close}
        title={strings.close}
        className="ml-auto rounded px-2 py-0.5 hover:bg-[var(--bg)]"
        onClick={closeSearch}
      >
        ×
      </button>
    </div>
  );
}
