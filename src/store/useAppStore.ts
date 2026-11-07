import { create } from "zustand";
import { createLibrarySlice, type LibrarySlice } from "./slices/librarySlice";
import { createSettingsSlice, type SettingsSlice } from "./slices/settingsSlice";
import { createUiSlice, type UiSlice } from "./slices/uiSlice";

export type AppStore = LibrarySlice & SettingsSlice & UiSlice;

export const useAppStore = create<AppStore>()((...a) => ({
  ...createLibrarySlice(...a),
  ...createSettingsSlice(...a),
  ...createUiSlice(...a),
}));
