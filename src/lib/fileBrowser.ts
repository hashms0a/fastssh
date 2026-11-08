/**
 * "Show in File Browser" (task 7.4, 7.5, R16): resolve the real target of a
 * host and ask Rust to launch the desktop's file manager at sftp://.
 * Localhost has no remote address, so it is refused with an explanation
 * (R16 is remote-only; the owner kept that rule).
 */
import { ipc } from "./ipc";
import { strings } from "./strings";
import { errorText } from "./errorText";
import { browserTarget } from "./sftpTarget";
import { logError, logInfo } from "./log";
import { useAppStore } from "../store/useAppStore";
import type { Host } from "../types/models";

/** The URL inside the AppError message ("… Copy this address: sftp://…"). */
export function urlInMessage(message: string): string | null {
  const m = /(?:sftp|https?):\/\/[^\s]+/i.exec(message);
  return m ? m[0] : null;
}

export function isLocalHost(host: Host): boolean {
  return host.local === true || !host.host.trim();
}

export async function showFileBrowserFor(host: Host): Promise<void> {
  const st = useAppStore.getState();
  if (isLocalHost(host)) {
    st.pushToast(strings.fileBrowserLocalOnly);
    return;
  }
  const target = browserTarget(host, st.accounts, st.settings.syncSshConfig);
  try {
    const method = await ipc.openSftpFileBrowser(target.user, target.host, target.port);
    logInfo(`open_sftp ${target.host}:${target.port} via ${method}`);
  } catch (e) {
    logError(`open_sftp ${target.host}:${target.port} failed`, e);
    const message = errorText(e);
    // Section 2: the toast names the address and offers a Copy button.
    st.pushToast(message, "error", urlInMessage(message) ?? undefined);
  }
}
