import { strings } from "../../lib/strings";
import { addAccount, addHost } from "../../lib/editorActions";
import { importEasysshNow } from "../../lib/importActions";
import { useAppStore } from "../../store/useAppStore";

/** Shown when the library is empty: Localhost only (hosts side) or no
 *  shared accounts (accounts side). (R22)
 *
 * Task 10.7: with EasySSH data on disk and nothing in the library, the first
 * thing to offer is the one-click import, so an EasySSH user gets their
 * connections without opening a menu. */
export function WelcomeView() {
  const mode = useAppStore((s) => s.sidebarMode);
  const accountsSide = mode === "accounts";
  const legacyAvailable = useAppStore((s) => s.legacyAvailable);
  const legacyHosts = useAppStore((s) => s.legacyHosts);
  const locked = useAppStore((s) => s.locked);
  const showImport = !accountsSide && legacyAvailable && !locked;
  return (
    <div data-testid="welcome-view" className="flex flex-col items-center gap-3 p-8 text-center">
      <p className="text-lg font-medium text-[var(--muted)]">
        {accountsSide ? strings.noAccounts : strings.noConnections}
      </p>
      <button
        type="button"
        data-testid={accountsSide ? "new-account" : "welcome-new-connection"}
        title={accountsSide ? strings.newAccount : strings.newConnection}
        className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-60"
        onClick={accountsSide ? addAccount : addHost}
      >
        {accountsSide ? strings.newAccount : strings.newConnection}
      </button>
      {showImport && (
        <button
          type="button"
          data-testid="welcome-import-easyssh"
          title={strings.importEasyssh}
          className="rounded-md border border-[var(--accent)] px-3 py-1.5 text-sm text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white disabled:opacity-60"
          onClick={() => void importEasysshNow()}
        >
          {strings.importEasysshCount(legacyHosts)}
        </button>
      )}
    </div>
  );
}
