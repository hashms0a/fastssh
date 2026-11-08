//! Store glue for the quit flow (task 8.4): Ctrl+Q, the menu Quit and the
//! window close button all end here, so the state is saved the same way.

import { ipc } from "./ipc";
import { errorText } from "./errorText";
import { logError } from "./log";
import { isQuitting, quitFlow } from "./quitFlow";
import { useAppStore } from "../store/useAppStore";

/**
 * Resolves false when a quit is already running (a second Ctrl+Q). The
 * `quitting` guard lives in quitFlow, so a component can check it too.
 */
export function quitNow(): Promise<boolean> {
  const st = useAppStore.getState();
  return quitFlow({
    settings: st.settings,
    hosts: st.hosts,
    tabOrder: st.tabOrder,
    patch: st.updateSettings,
    flush: st.flushSettings,
    quit: () => ipc.quit(),
    onError: (e) => {
      logError("flushSettings before quit failed", e);
      st.pushToast(errorText(e), "error");
    },
  }).catch((e) => {
    logError("quit_app failed", e);
    st.pushToast(errorText(e), "error");
    return false;
  });
}

export { isQuitting };
