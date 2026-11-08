import { Plus, X } from "lucide-react";
import { strings } from "../../lib/strings";
import { useAppStore } from "../../store/useAppStore";
import { closeTab, connectHost } from "../../terminal/sessionController";
import type { Host } from "../../types/models";
import { SearchToolbar } from "../SearchToolbar";
import { TerminalPane } from "./TerminalPane";

const NO_TABS: string[] = [];

interface TabProps {
  tabId: string;
  hostId: string;
  active: boolean;
}

/** Narrow selectors (task 4.13): a tab row re-renders on its own fields only. */
function TabButton({ tabId, hostId, active }: TabProps) {
  const title = useAppStore((s) => s.tabs[tabId]?.title ?? "");
  const unread = useAppStore((s) => s.tabs[tabId]?.unread ?? false);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  return (
    <div
      role="tab"
      tabIndex={0}
      aria-selected={active}
      data-testid="tab"
      data-tab-id={tabId}
      data-title={title}
      className={`flex items-center gap-1.5 rounded-t border-b-2 px-2 py-1 text-sm ${
        active ? "border-[var(--accent)] bg-[var(--bg)]" : "border-transparent text-[var(--muted)] hover:bg-[var(--bg)]"
      }`}
      onClick={() => setActiveTab(hostId, tabId)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setActiveTab(hostId, tabId);
        }
      }}
    >
      <span className="max-w-48 truncate">{title}</span>
      {unread && <span data-testid="tab-unread" className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />}
      <button
        type="button"
        data-testid="tab-close"
        aria-label={strings.closeTab}
        title={strings.closeTab}
        className="rounded p-0.5 hover:bg-[var(--border)]"
        onClick={(e) => {
          e.stopPropagation();
          closeTab(tabId);
        }}
      >
        <X size={13} aria-hidden />
      </button>
    </div>
  );
}

interface Props {
  host: Host;
  /** The selected host's notebook is laid out; the others stay mounted hidden. */
  visible: boolean;
}

/**
 * Host-owned notebook (R10, task 4.8): the tab bar plus every pane, all
 * mounted. Switching hosts hides the notebook instead of unmounting it, so
 * scrollback and the PTY session survive.
 */
export function HostNotebook({ host, visible }: Props) {
  const ids = useAppStore((s) => s.tabOrder[host.id] ?? NO_TABS);
  const activeId = useAppStore((s) => s.activeTabByHost[host.id] ?? null);
  const searchOpen = useAppStore((s) => s.searchOpen);

  return (
    <section
      data-testid="notebook"
      data-host-id={host.id}
      className={`${visible ? "flex min-h-0 flex-1 flex-col" : "hidden"}`}
    >
      {/* R14: the toolbar belongs to the visible notebook's active tab. */}
      {visible && searchOpen && <SearchToolbar />}
      <div
        data-testid="tab-bar"
        role="tablist"
        className="flex items-end gap-1 overflow-x-auto border-b border-[var(--border)] bg-[var(--bg-alt)] px-2 pt-1"
      >
        {ids.map((id) => (
          <TabButton key={id} tabId={id} hostId={host.id} active={id === activeId} />
        ))}
        <button
          type="button"
          data-testid="tab-new"
          aria-label={strings.newTab}
          title={strings.newTab}
          className="mb-1 rounded p-1 hover:bg-[var(--bg)]"
          onClick={() => void connectHost(host)}
        >
          <Plus size={14} aria-hidden />
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        {ids.map((id) => (
          <TerminalPane key={id} tabId={id} visible={visible && id === activeId} />
        ))}
      </div>
    </section>
  );
}
