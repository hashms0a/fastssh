import { useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { strings } from "../../lib/strings";
import { sortedAccounts, visibleGroups } from "../../lib/libraryView";
import { useAppStore } from "../../store/useAppStore";
import { toggleGroupCollapsed } from "../../store/slices/librarySlice";
import { HostRow } from "./HostRow";
import { AccountRow } from "./AccountRow";

/**
 * Sidebar (R22): Hosts/Accounts segmented toggle, collapsible group
 * headers with counts (persisted in settings.collapsedGroups), natural
 * sorting, and filtering on name/host/username/group. The grouped list is
 * memoized on [hosts, filter] so typing stays smooth at 2000 hosts.
 */
export function SourceListView() {
  const hosts = useAppStore((s) => s.hosts);
  const accounts = useAppStore((s) => s.accounts);
  const mode = useAppStore((s) => s.sidebarMode);
  const setMode = useAppStore((s) => s.setSidebarMode);
  const filter = useAppStore((s) => s.filter);
  const selectedHostId = useAppStore((s) => s.selectedHostId);
  const selectedAccountId = useAppStore((s) => s.selectedAccountId);
  const collapsed = useAppStore((s) => s.settings.collapsedGroups);
  const store = useAppStore;
  const groups = useMemo(() => visibleGroups(hosts, filter), [hosts, filter]);
  const shownAccounts = useMemo(() => sortedAccounts(accounts), [accounts]);

  const onConnect = () => store.getState().pushToast(strings.comingSoon); // Stage 4

  const tab = (value: "hosts" | "accounts", label: string) => (
    <button
      key={value}
      type="button"
      data-testid={`sidebar-toggle-${value}`}
      aria-pressed={mode === value}
      className={`flex-1 rounded px-2 py-1 text-sm ${
        mode === value ? "bg-[var(--accent)] text-white" : "hover:bg-[var(--bg)]"
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
        data-testid={mode === "hosts" ? "host-list" : "account-list"}
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-2"
      >
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
