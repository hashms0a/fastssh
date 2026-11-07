import { useEffect, useRef } from "react";
import { attach, focusTerminal, safeFit } from "../../terminal/terminalRegistry";

interface Props {
  tabId: string;
  /** False for a pane whose host is not selected, or that is not the active tab. */
  visible: boolean;
}

/**
 * One terminal container (task 4.9). The xterm instance lives in the
 * registry; this component only moves its host div in and out, fits it while
 * it has a real size, and focuses it when it becomes the visible tab.
 */
export function TerminalPane({ tabId, visible }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

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

  return (
    <div
      ref={ref}
      data-testid="terminal-pane"
      data-tab-id={tabId}
      className={`h-full w-full ${visible ? "" : "hidden"}`}
    />
  );
}
