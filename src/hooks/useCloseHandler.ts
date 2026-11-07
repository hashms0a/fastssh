import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { logError } from "../lib/log";
import { useAppStore } from "../store/useAppStore";

/**
 * Flushes debounced settings when the window closes (R19). Tauri v2 awaits
 * an async onCloseRequested handler before destroying the window, so a
 * simple await is enough (verified against @tauri-apps/api 2.12: the
 * handler's Promise is awaited by the core close path).
 */
export function useCloseHandler(): void {
  const flushSettings = useAppStore((s) => s.flushSettings);

  useEffect(() => {
    const win = getCurrentWindow();
    let unlisten: UnlistenFn | null = null;
    let disposed = false;
    void win
      .onCloseRequested(async () => {
        await flushSettings();
      })
      .then((un) => {
        if (disposed) un();
        else unlisten = un;
      })
      .catch((e) => logError("useCloseHandler: onCloseRequested failed", e));
    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, [flushSettings]);
}
