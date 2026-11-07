import { strings } from "../../lib/strings";
import { libraryIsEmpty } from "../../lib/libraryView";
import { editAccount, removeAccountAction } from "../../lib/editorActions";
import { useAppStore } from "../../store/useAppStore";
import { WelcomeView } from "./WelcomeView";
import { ConnectionLanding } from "./ConnectionLanding";

/**
 * Picks the workspace content for the selected host (or the welcome
 * screen when nothing is configured yet). Filtering never changes the
 * selection, so a filtered-out host keeps showing its landing card.
 */
export function WorkspaceEmptyState() {
  const mode = useAppStore((s) => s.sidebarMode);
  const hosts = useAppStore((s) => s.hosts);
  const accounts = useAppStore((s) => s.accounts);
  const selectedHostId = useAppStore((s) => s.selectedHostId);
  const selectedAccountId = useAppStore((s) => s.selectedAccountId);

  if (mode === "accounts") {
    const account = accounts.find((a) => a.id === selectedAccountId) ?? accounts[0];
    if (!account) return <WelcomeView />;
    return (
      <div
        data-testid="account-landing"
        data-name={account.name}
        className="m-6 flex w-96 max-w-full flex-col gap-4 self-center rounded-lg border border-[var(--border)] bg-[var(--bg-alt)] p-6 shadow"
      >
        <div>
          <h2 data-testid="account-landing-name" className="text-xl font-semibold">
            {account.name}
          </h2>
          <p className="text-sm text-[var(--muted)]">{account.username || strings.sidebarAccounts}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="account-edit"
            className="flex-1 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--bg)]"
            onClick={() => editAccount(account)}
          >
            {strings.edit}
          </button>
          <button
            type="button"
            data-testid="account-remove"
            className="flex-1 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--bg)]"
            onClick={() => void removeAccountAction(account)}
          >
            {strings.remove}
          </button>
        </div>
      </div>
    );
  }

  if (libraryIsEmpty(hosts)) return <WelcomeView />;
  const host = hosts.find((h) => h.id === selectedHostId) ?? hosts[0];
  if (!host) return <WelcomeView />;
  return <ConnectionLanding host={host} />;
}
