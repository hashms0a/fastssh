import { create } from "zustand";
import { createLibrarySlice, type LibrarySlice } from "./slices/librarySlice";
import { createModalSlice, type ModalSlice } from "./slices/modalSlice";
import { createSettingsSlice, type SettingsSlice } from "./slices/settingsSlice";
import { createTabsSlice, type TabsSlice } from "./slices/tabsSlice";
import { createUiSlice, type UiSlice } from "./slices/uiSlice";

export type AppStore = LibrarySlice & SettingsSlice & UiSlice & ModalSlice & TabsSlice;

export const useAppStore = create<AppStore>()((...a) => ({
  ...createLibrarySlice(...a),
  ...createSettingsSlice(...a),
  ...createUiSlice(...a),
  ...createModalSlice(...a),
  ...createTabsSlice(...a),
}));
