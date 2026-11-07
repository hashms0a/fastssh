import { create } from "zustand";
import { createLibrarySlice, type LibrarySlice } from "./slices/librarySlice";
import { createSettingsSlice, type SettingsSlice } from "./slices/settingsSlice";
import { createUiSlice, type UiSlice } from "./slices/uiSlice";
import { createModalSlice, type ModalSlice } from "./slices/modalSlice";

export type AppStore = LibrarySlice & SettingsSlice & UiSlice & ModalSlice;

export const useAppStore = create<AppStore>()((...a) => ({
  ...createLibrarySlice(...a),
  ...createSettingsSlice(...a),
  ...createUiSlice(...a),
  ...createModalSlice(...a),
}));
