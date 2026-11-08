import { debug, error, info, warn } from "@tauri-apps/plugin-log";

/**
 * Thin wrapper over tauri-plugin-log so components never import the plugin.
 * The `catch` is deliberate (plan 12.1): the plugin is absent under vitest and
 * in a plain browser run, and losing a log line must never break a feature -
 * every caller that logs an error also reports it to the user.
 */
export const logDebug = (message: string) => void debug(message).catch(() => {});
export const logInfo = (message: string) => void info(message).catch(() => {});
export const logWarn = (message: string) => void warn(message).catch(() => {});
export const logError = (message: string, err?: unknown) =>
  void error(err === undefined ? message : `${message}: ${String(err)}`).catch(() => {});
