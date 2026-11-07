import type { StateCreator } from "zustand";
import type { AppSettings } from "../../types/models";
import { DEFAULT_SETTINGS } from "../../types/models";
import { debounce } from "../../lib/debounce";
import { ipc } from "../../lib/ipc";
import { logDebug, logError } from "../../lib/log";
import type { AppStore } from "../useAppStore";

export interface SettingsSlice {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
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
  const saver = debounce(() => {
    const cur = get().settings;
    ipc
      .saveSettings(cur)
      .then(() => logDebug(`saved settings ${cur.windowWidth}x${cur.windowHeight}`))
      .catch((e) => logError("save_settings failed", e));
  }, 400);
  return {
    settings: DEFAULT_SETTINGS,
    updateSettings: (patch) => {
      set({ settings: applyPatch(get().settings, patch) });
      saver.call();
    },
    flushSettings: async () => {
      saver.cancel();
      await ipc.saveSettings(get().settings);
    },
  };
};
