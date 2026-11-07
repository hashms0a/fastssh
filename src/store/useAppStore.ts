import { create } from "zustand";
import { createLibrarySlice, type LibrarySlice } from "./slices/librarySlice";
import { createSettingsSlice, type SettingsSlice } from "./slices/settingsSlice";

export type AppStore = LibrarySlice & SettingsSlice;

export const useAppStore = create<AppStore>()((...a) => ({
  ...createLibrarySlice(...a),
  ...createSettingsSlice(...a),
}));
