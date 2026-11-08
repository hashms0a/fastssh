import { useState } from "react";
import { Bookmark, EllipsisVertical, Plus, TerminalSquare } from "lucide-react";
import { strings } from "../lib/strings";
import { quitNow } from "../lib/quitActions";
import { addHost } from "../lib/editorActions";
import { importEasysshNow } from "../lib/importActions";
import { openLocalShell } from "../terminal/sessionController";
import { useAppStore } from "../store/useAppStore";
import { ContextMenu } from "./ContextMenu";
import { BookmarksPopover } from "./BookmarksPopover";

/**
 * Header bar (R22): New Connection, Local Shell, Bookmarks, the filter
 * field and the app menu. Not-yet-built actions are disabled with a
 * "Coming soon" tooltip, so the layout is final from Stage 2.
 */
export function HeaderBar() {
  const filter = useAppStore((s) => s.filter);
  const setFilter = useAppStore((s) => s.setFilter);
  const openPreferences = useAppStore((s) => s.openPreferences);
  const openAbout = useAppStore((s) => s.openAbout);
  const legacyAvailable = useAppStore((s) => s.legacyAvailable);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [popover, setPopover] = useState<{ x: number; y: number } | null>(null);

  /** R3: closing the popover puts the focus back on the header button. */
  const closeBookmarks = (): void => {
    setPopover(null);
    (document.querySelector('[data-testid="bookmarks"]') as HTMLElement | null)?.focus();
  };

  return (
    <header
      data-testid="header-bar"
      className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-alt)] px-3 py-2"
    >
      <span className="mr-1 font-semibold text-[var(--accent)]">{strings.appName}</span>

      <button
        type="button"
        data-testid="new-connection"
        title={strings.newConnection}
        className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-sm hover:bg-[var(--accent)] hover:text-white disabled:opacity-60"
        onClick={addHost}
      >
        <Plus size={15} aria-hidden />
        {strings.newConnection}
      </button>

      <button
        type="button"
        data-testid="local-shell"
        title={strings.localShell}
        className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-sm hover:bg-[var(--accent)] hover:text-white"
        onClick={() => openLocalShell()}
      >
        <TerminalSquare size={15} aria-hidden />
        {strings.localShell}
      </button>

      <button
        type="button"
        data-testid="bookmarks"
        title={strings.bookmarks}
        aria-expanded={popover ? true : undefined}
        className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-sm hover:bg-[var(--accent)] hover:text-white"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPopover({ x: r.left, y: r.bottom + 4 });
        }}
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

      {popover && <BookmarksPopover x={popover.x} y={popover.y} onClose={closeBookmarks} />}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          testId="header-menu-list"
          onClose={() => setMenu(null)}
          items={[
            { label: strings.preferences, run: openPreferences },
            {
              label: strings.importEasyssh,
              run: () => void importEasysshNow(),
              disabled: !legacyAvailable,
              title: legacyAvailable ? undefined : strings.noEasysshData,
            },
            { label: strings.about, run: openAbout },
            { label: strings.quit, run: () => void quitNow() },
          ]}
        />
      )}
    </header>
  );
}
