import { useMemo, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { strings } from "../../lib/strings";
import { sidebarAction } from "../../lib/sidebarKeys";
import { sortedAccounts, visibleGroups } from "../../lib/libraryView";
import { connectHost } from "../../terminal/sessionController";
import type { Host } from "../../types/models";
import { useAppStore } from "../../store/useAppStore";
import { toggleGroupCollapsed } from "../../store/slices/librarySlice";
import { countRender } from "../../lib/renderLog";
import { HostRow } from "./HostRow";
import { AccountRow } from "./AccountRow";

const ROW_SELECTOR = '[data-testid="host-row"], [data-testid="account-row"]';

/**
 * Sidebar (R22): Hosts/Accounts segmented toggle, collapsible group
 * headers with counts (persisted in settings.collapsedGroups), natural
 * sorting, and filtering on name/host/username/group. The grouped list is
 * memoized on [hosts, filter] so typing stays smooth at 2000 hosts.
 *
 * Task 12.5: the list is a `listbox`; ArrowUp/Down/Home/End move the
 * selection through the rendered rows, and Enter on a row connects it
 * (`HostRow`) or opens its editor (`AccountRow`).
 */
export function SourceListView() {
  countRender("sidebar"); // task 12.4
  const hosts = useAppStore((s) => s.hosts);
  const accounts = useAppStore((s) => s.accounts);
  const mode = useAppStore((s) => s.sidebarMode);
  const setMode = useAppStore((s) => s.setSidebarMode);
  const filter = useAppStore((s) => s.filter);
  const selectedHostId = useAppStore((s) => s.selectedHostId);
  const selectedAccountId = useAppStore((s) => s.selectedAccountId);
  const collapsed = useAppStore((s) => s.settings.collapsedGroups);
  const store = useAppStore;
  const listRef = useRef<HTMLDivElement>(null);
  const selectHost = useAppStore((s) => s.selectHost);
  const selectAccount = useAppStore((s) => s.selectAccount);
  const groups = useMemo(() => visibleGroups(hosts, filter), [hosts, filter]);
  const shownAccounts = useMemo(() => sortedAccounts(accounts), [accounts]);

  const onConnect = (host: Host) => void connectHost(host);

  /** Arrow navigation; Enter/Space belong to the row itself. */
  const onListKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    const rows = [...(listRef.current?.querySelectorAll<HTMLElement>(ROW_SELECTOR) ?? [])];
    const action = sidebarAction(e.key, rows.indexOf(e.target as HTMLElement), rows.length);
    if (!action) return;
    e.preventDefault();
    const row = rows[action.index];
    row?.focus();
    const id = row?.dataset.id;
    if (!id) return;
    if (mode === "hosts") {
      selectHost(id);
    } else {
      selectAccount(id);
    }
  };

  const tab = (value: "hosts" | "accounts", label: string) => (
    <button
      key={value}
      type="button"
      data-testid={`sidebar-toggle-${value}`}
      aria-pressed={mode === value}
      className={`flex-1 rounded px-2 py-1 text-sm ${
        mode === value ? "bg-[var(--accent)] text-[var(--on-accent)]" : "hover:bg-[var(--bg)]"
      }`}
      onClick={() => setMode(value)}
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div data-testid="sidebar-toggle" className="m-2 flex gap-1 rounded-md bg-[var(--bg)] p-1">
        {tab("hosts", strings.sidebarHosts)}
        {tab("accounts", strings.sidebarAccounts)}
      </div>

      <div
        ref={listRef}
        data-testid={mode === "hosts" ? "host-list" : "account-list"}
        role="listbox"
        aria-label={mode === "hosts" ? strings.connectionList : strings.accountList}
        tabIndex={-1}
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-2"
        onKeyDown={onListKeyDown}
      >
        {mode === "hosts" && groups.length === 0 && (
          <p data-testid="filter-no-match" className="px-2 py-2 text-sm text-[var(--muted)]">
            {strings.filterNoMatch}
          </p>
        )}

        {mode === "hosts" &&
          groups.map((g) => {
            const isCollapsed = collapsed.includes(g.name);
            return (
              <div key={g.name} data-testid={`group-${g.name}`}>
                <button
                  type="button"
                  data-testid={`group-header-${g.name}`}
                  aria-expanded={!isCollapsed}
                  title={strings.collapseGroup(g.name)}
                  className="mt-2 flex w-full items-center gap-1 px-1 py-0.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted)] hover:text-[var(--fg)]"
                  onClick={() => toggleGroupCollapsed(store.getState(), g.name)}
                >
                  {isCollapsed ? <ChevronRight size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
                  <span className="truncate">{g.name}</span>
                  <span data-testid={`group-count-${g.name}`} className="ml-auto tabular-nums">
                    {strings.groupCount(g.hosts.length)}
                  </span>
                </button>
                {!isCollapsed && (
                  <div className="space-y-0.5">
                    {g.hosts.map((h) => (
                      <HostRow key={h.id} host={h} selected={h.id === selectedHostId} onConnect={onConnect} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

        {mode === "accounts" &&
          shownAccounts.map((a) => <AccountRow key={a.id} account={a} selected={a.id === selectedAccountId} />)}
      </div>
    </div>
  );
}
