import { logInfo } from "../lib/log";

/**
 * Web-link handler for the terminal (task 6.9, R12). `window.open` does
 * nothing in Tauri, so links go through a command; `open_url` arrives with the
 * SFTP file browser in Stage 7. Until then the URI is logged, which keeps the
 * click visible in the log instead of silently doing nothing.
 */
export function openExternalUrl(uri: string): void {
  logInfo(`open_url ${uri} (wired in Stage 7)`);
}
