import { useState } from "react";
import { Bookmark, EllipsisVertical, Plus, TerminalSquare } from "lucide-react";
import { strings } from "../lib/strings";
import { ipc } from "../lib/ipc";
import { logError } from "../lib/log";
import { useAppStore } from "../store/useAppStore";
import { LOCALHOST_ID } from "../types/models";
import { ContextMenu } from "./ContextMenu";

/**
 * Header bar (R22): New Connection, Local Shell, Bookmarks, the filter
 * field and the app menu. Not-yet-built actions are disabled with a
 * "Coming soon" tooltip, so the layout is final from Stage 2.
 */
export function HeaderBar() {
  const filter = useAppStore((s) => s.filter);
  const setFilter = useAppStore((s) => s.setFilter);
  const selectHost = useAppStore((s) => s.selectHost);
  const setSidebarMode = useAppStore((s) => s.setSidebarMode);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  return (
    <header
      data-testid="header-bar"
      className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-alt)] px-3 py-2"
    >
      <span className="mr-1 font-semibold text-[var(--accent)]">{strings.appName}</span>

      <button
        type="button"
        data-testid="new-connection"
        title={strings.comingSoon}
        disabled
        className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-sm hover:bg-[var(--accent)] hover:text-white disabled:opacity-60"
      >
        <Plus size={15} aria-hidden />
        {strings.newConnection}
      </button>

      <button
        type="button"
        data-testid="local-shell"
        title={strings.localShell}
        className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-sm hover:bg-[var(--accent)] hover:text-white"
        onClick={() => {
          setSidebarMode("hosts");
          selectHost(LOCALHOST_ID);
        }}
      >
        <TerminalSquare size={15} aria-hidden />
        {strings.localShell}
      </button>

      <button
        type="button"
        data-testid="bookmarks"
        title={strings.comingSoon}
        disabled
        className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-sm hover:bg-[var(--accent)] hover:text-white disabled:opacity-60"
      >
        <Bookmark size={15} aria-hidden />
        {strings.bookmarks}
      </button>

      <input
        type="text"
        data-testid="host-filter"
        aria-label={strings.filterPlaceholder}
        placeholder={strings.filterPlaceholder}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="ml-auto w-56 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
      />

      <button
        type="button"
        data-testid="header-menu"
        aria-label={strings.menu}
        className="rounded-md p-1.5 hover:bg-[var(--bg)]"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setMenu({ x: r.left - 140, y: r.bottom + 4 });
        }}
      >
        <EllipsisVertical size={18} aria-hidden />
      </button>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          testId="header-menu-list"
          onClose={() => setMenu(null)}
          items={[
            { label: strings.preferences, run: () => undefined, disabled: true, title: strings.comingSoon },
            { label: strings.importEasyssh, run: () => undefined, disabled: true, title: strings.comingSoon },
            { label: strings.about, run: () => undefined, disabled: true, title: strings.comingSoon },
            { label: strings.quit, run: () => ipc.quit().catch((e) => logError("quit_app failed", e)) },
          ]}
        />
      )}
    </header>
  );
}
