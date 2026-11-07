import { useState } from "react";
import type { Host } from "../../types/models";
import { LOCALHOST_ID } from "../../types/models";
import { strings } from "../../lib/strings";
import { useAppStore } from "../../store/useAppStore";
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
 * connects, right-click opens the context menu (Stage 2: Connect only is
 * meaningful for Localhost; the rest arrive in Stage 3).
 */
export function HostRow({ host, selected, onConnect }: Props) {
  const selectHost = useAppStore((s) => s.selectHost);
  const pushToast = useAppStore((s) => s.pushToast);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const soon = () => pushToast(strings.comingSoon);
  const isLocal = host.id === LOCALHOST_ID;

  const items = isLocal
    ? [{ label: strings.connect, run: () => onConnect(host) }]
    : [
        { label: strings.connect, run: () => onConnect(host) },
        { label: strings.edit, run: soon },
        { label: strings.duplicate, run: soon },
        { label: strings.remove, run: soon },
      ];

  return (
    <div
      data-testid="host-row"
      data-name={host.name}
      role="button"
      tabIndex={0}
      aria-selected={selected}
      className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm ${
        selected ? "bg-[var(--accent)] text-white" : "hover:bg-[var(--bg)]"
      }`}
      onClick={() => selectHost(host.id)}
      onDoubleClick={() => onConnect(host)}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{host.name}</span>
        <span className={`block truncate text-xs ${selected ? "text-white/80" : "text-[var(--muted)]"}`}>
          {strings.hostSubtitle(host)}
        </span>
      </span>
      {/* Slots wired in Stages 4/6 (R13): tab-count badge + unread dot. */}
      <span data-testid="host-row-badge" className="hidden" />
      <span data-testid="host-row-unread" className="hidden" />
      {menu && <ContextMenu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />}
    </div>
  );
}
