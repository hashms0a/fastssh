import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { logDebug } from "./log";

/**
 * Clipboard over tauri-plugin-clipboard-manager (task 6.3, R12):
 * navigator.clipboard is unreliable in WebKitGTK. An empty selection copies
 * nothing, and a clipboard without text pastes nothing — no error toast.
 */

export async function copyText(text: string): Promise<void> {
  if (!text) return;
  await writeText(text);
}

/** "" when the clipboard has no text or the plugin refuses; never throws. */
export async function readClipboard(): Promise<string> {
  try {
    return await readText();
  } catch (e) {
    logDebug(`clipboard read failed: ${String(e)}`);
    return "";
  }
}
