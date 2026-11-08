import { useCallback, useRef } from "react";
import { strings } from "../lib/strings";
import { useAppStore } from "../store/useAppStore";

const MIN_W = 160;
const MAX_W = 600;
const STEP = 16;

const clamp = (n: number) => Math.min(MAX_W, Math.max(MIN_W, n));

/**
 * Sidebar resize handle (R19): drag clamps the width to 160-600 px and
 * stores it in settings.panelSize (debounced through updateSettings).
 * With keyboard focus, Left/Right move the divider by 16 px.
 */
export function Splitter() {
  const panelSize = useAppStore((s) => s.settings.panelSize);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const dragging = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return;
      updateSettings({ panelSize: clamp(Math.round(e.clientX)) });
    },
    [updateSettings],
  );

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "ArrowLeft") updateSettings({ panelSize: clamp(panelSize - STEP) });
      else if (e.key === "ArrowRight") updateSettings({ panelSize: clamp(panelSize + STEP) });
    },
    [panelSize, updateSettings],
  );

  return (
    <div
      data-testid="splitter"
      role="separator"
      aria-orientation="vertical"
      aria-label={strings.sidebarWidth}
      aria-valuenow={panelSize}
      aria-valuemin={MIN_W}
      aria-valuemax={MAX_W}
      tabIndex={0}
      className="w-1 shrink-0 cursor-col-resize bg-[var(--border)] hover:bg-[var(--accent)] focus:bg-[var(--accent)]"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
    />
  );
}
