import { ipc } from "../lib/ipc";
import { strings } from "../lib/strings";
import { errorText } from "../lib/errorText";
import { urlInMessage } from "../lib/fileBrowser";
import { logError, logInfo } from "../lib/log";
import { useAppStore } from "../store/useAppStore";

/**
 * Web-link handler for the terminal (task 7.3, R12). `window.open` does
 * nothing in Tauri, so the click goes to the `open_url` command, which only
 * accepts http:// and https:// and launches xdg-open with the sanitized
 * environment. A refused scheme (file:, javascript:, ssh:) and a failed
 * launch both report through a toast; the toast also carries the address so
 * it can be copied.
 */
export function openExternalUrl(uri: string): void {
  ipc
    .openUrl(uri)
    .then((method) => logInfo(`open_url ${uri} via ${method}`))
    .catch((e) => {
      logError(`open_url ${uri} failed`, e);
      const message = errorText(e) || strings.linkRefused(uri);
      useAppStore.getState().pushToast(message, "error", urlInMessage(message) ?? undefined);
    });
}
