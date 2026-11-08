import { useState } from "react";
import type { Host } from "../../types/models";
import { LOCALHOST_ID } from "../../types/models";
import { strings } from "../../lib/strings";
import { resolveCredentials } from "../../lib/hostUtils";
import { duplicateHostAction, editHost, removeHost } from "../../lib/editorActions";
import { activeTabOf, hostHasUnread, tabCountOf } from "../../store/slices/tabsSlice";
import { useAppStore } from "../../store/useAppStore";
import { countRender } from "../../lib/renderLog";
import { ContextMenu } from "../ContextMenu";

interface Props {
  host: Host;
  selected: boolean;
  /** Wired to the PTY in Stage 4; testable in isolation (task 2.13). */
  onConnect: (host: Host) => void;
}

/**
 * One host row: name, muted user@host:port line, tab-count badge and
 * unread-dot slots (wired Stages 4/6). Single click selects, double-click
 * connects, right-click opens the context menu. Task 12.5: the row is an
 * `option` in the sidebar listbox, Enter connects, Space selects, and the
 * badge/dot carry accessible names instead of being colour-only.
 */
export function HostRow({ host, selected, onConnect }: Props) {
  countRender(`hostRow:${host.name}`); // task 12.4
  const selectHost = useAppStore((s) => s.selectHost);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const accounts = useAppStore((s) => s.accounts);
  // Narrow selectors (task 4.13): terminal output re-renders no rows.
  const tabCount = useAppStore((s) => tabCountOf(s, host.id));
  const unread = useAppStore((s) => hostHasUnread(s, host.id));
  const activeTab = useAppStore((s) => activeTabOf(s, host.id));
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const isLocal = host.id === LOCALHOST_ID;

  const items = isLocal
    ? [{ label: strings.connect, run: () => onConnect(host) }]
    : [
        { label: strings.connect, run: () => onConnect(host) },
        { label: strings.edit, run: () => editHost(host) },
        { label: strings.duplicate, run: () => duplicateHostAction(host) },
        { label: strings.remove, run: () => void removeHost(host) },
      ];

  return (
    <div
      data-testid="host-row"
      data-name={host.name}
      data-id={host.id}
      role="option"
      tabIndex={0}
      aria-selected={selected}
      className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm ${
        selected ? "bg-[var(--accent)] text-[var(--on-accent)]" : "hover:bg-[var(--bg)]"
      }`}
      onClick={() => {
        selectHost(host.id);
        if (activeTab) setActiveTab(host.id, activeTab); // focusing clears the dot (R13)
      }}
      onDoubleClick={() => onConnect(host)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onConnect(host); // task 12.5: the keyboard path reaches a session
        } else if (e.key === " ") {
          e.preventDefault();
          selectHost(host.id);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{host.name}</span>
        <span className={`block truncate text-xs ${selected ? "text-[var(--on-accent)]" : "text-[var(--muted)]"}`}>
          {strings.hostSubtitle({ ...host, username: resolveCredentials(host, accounts).username })}
        </span>
      </span>
      {/* R13: open-tab count badge + unread dot, hidden when there is none. */}
      <span
        data-testid="host-row-badge"
        role="img"
        aria-label={strings.openTabsBadge(tabCount)}
        className={
          tabCount > 0
            ? "rounded border border-[var(--border)] bg-[var(--bg)] px-1.5 text-xs tabular-nums text-[var(--fg)]"
            : "hidden"
        }
      >
        {tabCount}
      </span>
      <span
        data-testid="host-row-unread"
        role="img"
        aria-label={strings.unreadDot}
        className={
          unread
            ? `h-1.5 w-1.5 shrink-0 rounded-full ${selected ? "bg-[var(--on-accent)]" : "bg-[var(--accent)]"}`
            : "hidden"
        }
      />
      {menu && <ContextMenu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />}
    </div>
  );
}
