import type { StateCreator } from "zustand";
import type { AppSettings } from "../../types/models";
import { DEFAULT_SETTINGS } from "../../types/models";
import { debounce } from "../../lib/debounce";
import { openedHostsFor } from "../../lib/quitFlow";
import { ipc } from "../../lib/ipc";
import { strings } from "../../lib/strings";
import { logDebug, logError } from "../../lib/log";
import type { AppStore } from "../useAppStore";

export interface SettingsSlice {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  /** Save the settings with nothing changed, so what the save reads from the
   *  store (the open tabs) reaches the disk. Task 12.3. */
  markSettingsDirty: () => void;
  flushSettings: () => Promise<void>;
}

// copyWith semantics: keys whose value is `undefined` are ignored, so a
// partially built patch can't wipe fields. To CLEAR a nullable field, the
// field type must be `T | null` and the patch passes `null` explicitly.
function applyPatch(s: AppSettings, patch: Partial<AppSettings>): AppSettings {
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  return { ...s, ...clean };
}

export const createSettingsSlice: StateCreator<AppStore, [], [], SettingsSlice> = (set, get) => {
  // A folder that refuses the write keeps failing every 400 ms, so the toast
  // appears once until a save succeeds again (plan 12.1).
  let saveNotified = false;
  const saver = debounce(() => {
    const cur = get().settings;
    // Task 12.3: the open tabs belong in every save, not only in the quit
    // flow. A kill -9 leaves the last 400 ms of tab state on disk instead of
    // nothing, and a crash is exactly when restore is wanted.
    const st = get();
    const next = cur.restoreHosts
      ? { ...cur, openedHosts: openedHostsFor({ settings: cur, hosts: st.hosts, tabOrder: st.tabOrder }) }
      : cur;
    ipc
      .saveSettings(next)
      .then(() => {
        saveNotified = false;
        logDebug(`saved settings ${next.windowWidth}x${next.windowHeight}`);
      })
      .catch((e) => {
        logError("save_settings failed", e);
        if (saveNotified) return;
        saveNotified = true;
        get().pushToast(strings.settingsSaveFailed, "error");
      });
  }, 400);
  return {
    settings: DEFAULT_SETTINGS,
    updateSettings: (patch) => {
      set({ settings: applyPatch(get().settings, patch) });
      saver.call();
    },
    markSettingsDirty: () => saver.call(),
    flushSettings: async () => {
      saver.cancel();
      await ipc.saveSettings(get().settings);
    },
  };
};
