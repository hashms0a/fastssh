import { debug, error, info, warn } from "@tauri-apps/plugin-log";

/** Thin wrapper over tauri-plugin-log so components never import the plugin. */
export const logDebug = (message: string) => void debug(message).catch(() => {});
export const logInfo = (message: string) => void info(message).catch(() => {});
export const logWarn = (message: string) => void warn(message).catch(() => {});
export const logError = (message: string, err?: unknown) =>
  void error(err === undefined ? message : `${message}: ${String(err)}`).catch(() => {});
