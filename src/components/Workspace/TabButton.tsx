import { useRef, useState } from "react";
import { X } from "lucide-react";
import { strings } from "../../lib/strings";
import { countRender } from "../../lib/renderLog";
import { useAppStore } from "../../store/useAppStore";
import { closeTab } from "../../terminal/sessionController";

interface Props {
  tabId: string;
  hostId: string;
  active: boolean;
  /** A drag is in flight from another tab of this notebook. */
  dragTarget: boolean;
  /** This tab is the one being dragged. */
  dragged: boolean;
  onDragStart: (tabId: string) => void;
  onDragEnd: () => void;
  /** Something was dragged onto this tab. */
  onDropOn: (targetId: string) => void;
}

/**
 * Narrow selectors (task 4.13): a tab row re-renders on its own fields only.
 * Stage 11 (P2) adds the two tab gestures: drag it onto another tab to move
 * it, and double-click it to rename. The title lives on the tab object, which
 * is never saved.
 *
 * The drag has to carry payload: WebKitGTK (the Tauri webview on Linux) starts
 * no drag session for a `draggable` element whose `dragstart` leaves
 * `dataTransfer` empty, so a bare `effectAllowed` produced a tab that looked
 * grabbable and moved nothing. It also needs `dropEffect` on the hover to keep
 * the drop allowed. The gestures stay separated: the close button and the
 * rename field cancel `dragstart`, so pressing on the "x" or editing a title
 * never drags the tab.
 */
export function TabButton({ tabId, hostId, active, dragTarget, dragged, onDragStart, onDragEnd, onDropOn }: Props) {
  countRender(`tab:${tabId}`); // task 12.4
  const title = useAppStore((s) => s.tabs[tabId]?.title ?? "");
  const unread = useAppStore((s) => s.tabs[tabId]?.unread ?? false);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const renameTab = useAppStore((s) => s.renameTab);
  const [renaming, setRenaming] = useState(false);
  // When the field opened, in ms. The pane of a tab that just became active
  // focuses its terminal on mount, which blurs the field a moment after it
  // opened; that is not the user leaving it, so a blur that early keeps the
  // field open and takes the focus back.
  const openedAt = useRef(0);

  const open = (): void => {
    setActiveTab(hostId, tabId);
    openedAt.current = Date.now();
    setRenaming(true);
  };

  const commit = (raw: string): void => {
    renameTab(tabId, raw);
    setRenaming(false);
  };

  return (
    <div
      role="tab"
      tabIndex={0}
      aria-selected={active}
      data-testid="tab"
      data-tab-id={tabId}
      data-title={title}
      draggable={!renaming}
      className={`flex shrink-0 items-center gap-1.5 rounded-t border-b-2 px-2 py-1 text-sm ${
        active ? "border-[var(--accent)] bg-[var(--bg)]" : "border-transparent text-[var(--muted)] hover:bg-[var(--bg)]"
      } ${dragTarget ? "border-[var(--accent)] border-dashed" : ""} ${dragged ? "opacity-50" : ""}`}
      onClick={() => setActiveTab(hostId, tabId)}
      onDoubleClick={open}
      onDragStart={(e) => {
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", tabId); // a drag with no data never starts here
        }
        onDragStart(tabId);
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        if (!dragTarget) return; // only a drop onto another tab is a move
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDropOn(tabId);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setActiveTab(hostId, tabId);
        }
      }}
    >
      {renaming ? (
        <input
          type="text"
          data-testid="tab-rename"
          aria-label={strings.renameTab}
          defaultValue={title}
          autoFocus
          className="w-32 rounded border border-[var(--accent)] bg-[var(--bg)] px-1 py-0.5 text-sm"
          onClick={(e) => e.stopPropagation()}
          onDragStart={(e) => e.preventDefault()}
          onBlur={(e) => {
            if (Date.now() - openedAt.current < 300) {
              e.currentTarget.focus();
              return;
            }
            commit(e.currentTarget.value);
          }}
          onKeyDown={(e) => {
            e.stopPropagation(); // the global shortcut matrix must not see these keys
            if (e.key === "Enter") {
              e.preventDefault();
              commit(e.currentTarget.value);
            } else if (e.key === "Escape") {
              e.preventDefault();
              setRenaming(false);
            }
          }}
        />
      ) : (
        <span data-testid="tab-title" className="max-w-48 truncate">
          {title}
        </span>
      )}
      {unread && (
        <span
          data-testid="tab-unread"
          role="img"
          aria-label={strings.unreadDot}
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]"
        />
      )}
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
        onDragStart={(e) => {
          e.preventDefault(); // a press on the "x" closes the tab, it never drags it
          e.stopPropagation();
        }}
      >
        <X size={13} aria-hidden />
      </button>
    </div>
  );
}
