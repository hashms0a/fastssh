import { useRef, useState } from "react";
import { X } from "lucide-react";
import { strings } from "../../lib/strings";
import { useAppStore } from "../../store/useAppStore";
import { closeTab } from "../../terminal/sessionController";

interface Props {
  tabId: string;
  hostId: string;
  active: boolean;
  /** A drag is in flight from another tab of this notebook. */
  dragTarget: boolean;
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
 */
export function TabButton({ tabId, hostId, active, dragTarget, onDragStart, onDragEnd, onDropOn }: Props) {
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
      className={`flex items-center gap-1.5 rounded-t border-b-2 px-2 py-1 text-sm ${
        active ? "border-[var(--accent)] bg-[var(--bg)]" : "border-transparent text-[var(--muted)] hover:bg-[var(--bg)]"
      } ${dragTarget ? "border-[var(--accent)] border-dashed" : ""}`}
      onClick={() => setActiveTab(hostId, tabId)}
      onDoubleClick={open}
      onDragStart={(e) => {
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
        onDragStart(tabId);
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        if (dragTarget) e.preventDefault(); // only a drop onto another tab is a move
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
          className="w-32 rounded border border-[var(--accent)] bg-[var(--bg)] px-1 py-0.5 text-sm outline-none"
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
        <span className="max-w-48 truncate">{title}</span>
      )}
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
