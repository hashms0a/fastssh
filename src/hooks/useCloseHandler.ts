import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { logError } from "../lib/log";
import { quitNow } from "../lib/quitActions";

/**
 * The window close button runs the quit flow (task 8.4, R19): openedHosts is
 * written, settings are flushed, then quit_app kills the sessions and exits.
 * Tauri v2 awaits an async onCloseRequested handler before destroying the
 * window, so the flush really happens (verified against @tauri-apps/api 2.12).
 */
export function useCloseHandler(): void {
  useEffect(() => {
    const win = getCurrentWindow();
    let unlisten: UnlistenFn | null = null;
    let disposed = false;
    void win
      .onCloseRequested(async () => {
        try {
          await quitNow();
        } catch (e) {
          logError("close request: quit flow failed", e);
        }
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
  }, []);
}
