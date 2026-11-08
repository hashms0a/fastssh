import { useCallback, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { strings } from "../../lib/strings";
import { useAppStore } from "../../store/useAppStore";
import { connectHost } from "../../terminal/sessionController";
import type { Host } from "../../types/models";
import { SearchToolbar } from "../SearchToolbar";
import { TabButton } from "./TabButton";
import { TerminalPane } from "./TerminalPane";

const NO_TABS: string[] = [];

interface Props {
  host: Host;
  /** The selected host's notebook is laid out; the others stay mounted hidden. */
  visible: boolean;
}

/**
 * Host-owned notebook (R10, task 4.8): the tab bar plus every pane, all
 * mounted. Switching hosts hides the notebook instead of unmounting it, so
 * scrollback and the PTY session survive.
 *
 * Stage 11 (P2): dragging a tab onto another tab reorders this notebook (the
 * drag id is local state here, so a drop can never move a tab between hosts),
 * and a double-click renames it.
 */
export function HostNotebook({ host, visible }: Props) {
  const ids = useAppStore((s) => s.tabOrder[host.id] ?? NO_TABS);
  const activeId = useAppStore((s) => s.activeTabByHost[host.id] ?? null);
  const searchOpen = useAppStore((s) => s.searchOpen);
  const moveTab = useAppStore((s) => s.moveTab);
  // The dragged id lives in a ref as well as in state: the state only drives
  // the drop highlight, and a ref is what the drop handler reads, so a drop
  // cannot miss a state update that has not been rendered yet.
  const dragRef = useRef<string | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);

  const onDragStart = useCallback((tabId: string) => {
    dragRef.current = tabId;
    setDragged(tabId);
  }, []);
  const onDragEnd = useCallback(() => {
    dragRef.current = null;
    setDragged(null);
  }, []);
  const onDropOn = useCallback(
    (targetId: string) => {
      const id = dragRef.current;
      if (id) moveTab(host.id, id, targetId);
      dragRef.current = null;
      setDragged(null);
    },
    [moveTab, host.id],
  );

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
          <TabButton
            key={id}
            tabId={id}
            hostId={host.id}
            active={id === activeId}
            dragTarget={dragged !== null && dragged !== id}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDropOn={onDropOn}
          />
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
