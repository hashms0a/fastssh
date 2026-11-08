import { useState } from "react";
import { ipc } from "../lib/ipc";
import { disableSync, enableSync, type SyncDeps } from "../lib/sshConfigSync";
import { useAppStore } from "../store/useAppStore";

/**
 * The "Sync SSH config" switch of the Preferences modal (task 9.7, R7).
 *
 * `enableSync`/`disableSync` hold the rules; this hook only wires them to the
 * store and to the IPC commands, and returns a tick: a controlled checkbox is
 * re-synced from props only on the next render, so a cancelled or failed run
 * needs one to put the switch back.
 */
export function useSyncToggle(): { tick: number; run: (on: boolean) => Promise<void> } {
  const hosts = useAppStore((s) => s.hosts);
  const [tick, setTick] = useState(0);

  const run = async (on: boolean): Promise<void> => {
    const st = useAppStore.getState();
    const deps: SyncDeps = {
      hosts,
      info: ipc.sshConfigInfo,
      confirm: (title, message) => st.confirm({ title, message }),
      enable: ipc.enableSshConfigSync,
      disable: ipc.disableSshConfigSync,
      reload: async () => st.hydrate(await ipc.loadAll()),
      setSync: (v) => st.updateSettings({ syncSshConfig: v }),
      toast: st.pushToast,
    };
    try {
      if (on) await enableSync(deps);
      else await disableSync(deps);
    } finally {
      setTick((n) => n + 1);
    }
  };

  return { tick, run };
}
