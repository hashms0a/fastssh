import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { debounce } from "../lib/debounce";
import { logError } from "../lib/log";
import { useAppStore } from "../store/useAppStore";

/**
 * Stores the window size (logical px = physical / scaleFactor) and the
 * maximized flag into settings, debounced 500 ms. While maximized the
 * restore size must not be overwritten by the screen size, so only the
 * maximized flag updates then; while fullscreen nothing updates (R19a).
 *
 * XWayland quirk: a plain set_window_rect resize often does not produce a
 * window resize event, so a 700 ms poll of innerSize() is the safety net
 * and the events are the fast path.
 */
export function useWindowState(): void {
  const updateSettings = useAppStore((s) => s.updateSettings);

  useEffect(() => {
    const win = getCurrentWindow();
    let disposed = false;
    const unlisten: Array<() => void> = [];
    // Rust sized the window from settings before this mounted; skip the
    // resize storm of the first second so the saved size stays stable.
    const bootAt = Date.now();
    let last = { w: 0, h: 0, max: false };

    const save = debounce(() => {
      void (async () => {
        const maximized = await win.isMaximized();
        const scale = await win.scaleFactor();
        const size = await win.innerSize();
        const w = Math.round(size.width / scale);
        const h = Math.round(size.height / scale);
        if (maximized === last.max && (maximized || (w === last.w && h === last.h))) return;
        last = { w, h, max: maximized };
        if (Date.now() - bootAt < 1000) return; // startup resize storm
        if (await win.isFullscreen()) return; // keep the restore size
        updateSettings(
          maximized ? { windowMaximized: true } : { windowMaximized: false, windowWidth: w, windowHeight: h },
        );
      })().catch((e) => logError("window state save failed", e));
    }, 500);

    void win
      .onResized(() => save.call())
      .then((un) => !disposed && unlisten.push(un))
      .catch((e) => logError("onResized failed", e));
    void win
      .onMoved(() => save.call())
      .then((un) => !disposed && unlisten.push(un))
      .catch((e) => logError("onMoved failed", e));

    const poll = setInterval(() => save.call(), 700);
    save.call();

    return () => {
      disposed = true;
      clearInterval(poll);
      for (const un of unlisten) un();
    };
  }, [updateSettings]);
}
