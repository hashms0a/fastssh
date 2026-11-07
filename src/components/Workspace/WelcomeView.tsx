import { strings } from "../../lib/strings";
import { addAccount, addHost } from "../../lib/editorActions";
import { useAppStore } from "../../store/useAppStore";

/** Shown when the library is empty: Localhost only (hosts side) or no
 *  shared accounts (accounts side). (R22) */
export function WelcomeView() {
  const mode = useAppStore((s) => s.sidebarMode);
  const accountsSide = mode === "accounts";
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
    </div>
  );
}
