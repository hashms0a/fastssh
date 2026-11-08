import { useEffect, useRef, useState } from "react";
import { strings } from "../../lib/strings";
import { useAppStore } from "../../store/useAppStore";
import { closeTab } from "../../terminal/sessionController";
import { attach, focusTerminal, safeFit } from "../../terminal/terminalRegistry";
import {
  copyLastOutput,
  copySelection,
  openSearch,
  pasteFromClipboard,
  scrollLastCommand,
  selectAllTerminal,
  showFileBrowser,
} from "../../terminal/terminalActions";
import { ContextMenu } from "../ContextMenu";

interface Props {
  tabId: string;
  /** False for a pane whose host is not selected, or that is not the active tab. */
  visible: boolean;
}

/**
 * One terminal container (task 4.9). The xterm instance lives in the
 * registry; this component only moves its host div in and out, fits it while
 * it has a real size, focuses it when it becomes the visible tab, and shows
 * the right-click menu (task 6.4, R12).
 */
export function TerminalPane({ tabId, visible }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const hostId = useAppStore((s) => s.tabs[tabId]?.hostId ?? "");
  const isRemote = useAppStore((s) => {
    const host = s.hosts.find((h) => h.id === s.tabs[tabId]?.hostId);
    return !!host && host.local !== true;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    attach(tabId, el);
    safeFit(tabId);
    // Guarded inside safeFit: a hidden pane measures 0, and fitting that
    // would send cols=0 to the PTY. term.onResize only fires on a real
    // cols/rows change, so resize_pty is not called in a loop.
    const observer = new ResizeObserver(() => safeFit(tabId));
    observer.observe(el);
    return () => observer.disconnect();
  }, [tabId]);

  useEffect(() => {
    if (!visible) return;
    safeFit(tabId);
    focusTerminal(tabId);
  }, [tabId, visible]);

  const items = [
    { label: strings.copy, run: () => void copySelection(tabId) },
    { label: strings.paste, run: () => void pasteFromClipboard(tabId) },
    { label: strings.selectAll, run: () => selectAllTerminal(tabId) },
    { label: strings.search, run: () => openSearch(tabId) },
    { label: strings.copyLastOutput, run: () => copyLastOutput(tabId) },
    { label: strings.scrollLastCommand, run: () => scrollLastCommand(tabId) },
    // R16 opens sftp:// — wired with the file browser in Stage 7.
    {
      label: strings.showInFileBrowser,
      run: showFileBrowser,
      disabled: !isRemote,
      title: strings.comingSoon,
    },
    { label: strings.closeTab, run: () => closeTab(tabId) },
  ];

  return (
    <div
      ref={ref}
      data-testid="terminal-pane"
      data-tab-id={tabId}
      data-host-id={hostId}
      className={`h-full w-full ${visible ? "" : "hidden"}`}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      {visible && menu && (
        <ContextMenu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} testId="terminal-menu" />
      )}
    </div>
  );
}
