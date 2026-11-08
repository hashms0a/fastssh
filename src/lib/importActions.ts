/**
 * Store glue for the EasySSH import (task 10.7): the header menu item and the
 * WelcomeView button both end here, so the counts toast and the reload are the
 * same whichever way the user started it.
 */
import { ipc } from "./ipc";
import { logError } from "./log";
import { runEasysshImport } from "./easysshImport";
import { useAppStore } from "../store/useAppStore";

export function importEasysshNow(): Promise<"imported" | "failed"> {
  const st = useAppStore.getState();
  return runEasysshImport({
    importEasyssh: ipc.importEasyssh,
    reload: async () => st.hydrate(await ipc.loadAll()),
    toast: st.pushToast,
    log: logError,
  });
}
