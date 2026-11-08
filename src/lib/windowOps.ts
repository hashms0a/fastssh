import { getCurrentWindow } from "@tauri-apps/api/window";

/** F11 (task 6.2, R17): flip the fullscreen flag on the main window. */
export async function toggleFullscreen(): Promise<void> {
  const win = getCurrentWindow();
  await win.setFullscreen(!(await win.isFullscreen()));
}
