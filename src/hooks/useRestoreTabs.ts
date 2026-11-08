import { useEffect, useRef } from "react";
import { isQuitting } from "../lib/quitFlow";
import { restorePlan, runRestore } from "../lib/restore";
import { logError } from "../lib/log";
import { useAppStore } from "../store/useAppStore";
import { connectHost } from "../terminal/sessionController";

/**
 * Task 8.5: reopen the tabs of the previous run, once per app start (the
 * ref also absorbs React's StrictMode double effect). `openedHosts` is
 * cleared and flushed BEFORE the tabs open, so a crash in the middle of a
 * restore does not restore twice.
 */
export function useRestoreTabs(): void {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const st = useAppStore.getState();
    if (!st.settings.restoreHosts || st.settings.openedHosts.length === 0 || isQuitting()) return;
    const plan = restorePlan(st.settings.openedHosts, st.hosts);
    st.updateSettings({ openedHosts: [] });
    void st.flushSettings().catch((e) => logError("flushSettings after restore failed", e));
    void runRestore(plan, {
      open: (host) => connectHost(host),
      select: (host) => {
        st.setSidebarMode("hosts");
        st.selectHost(host.id);
      },
      stopped: isQuitting,
    }).catch((e) => logError("restoreTabs failed", e));
  }, []);
}
