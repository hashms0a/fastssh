import { strings } from "../../lib/strings";
import { libraryIsEmpty } from "../../lib/libraryView";
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

  if (mode === "accounts") {
    const account = accounts.find((a) => a.id === useAppStore.getState().selectedAccountId) ?? accounts[0];
    if (!account) return <WelcomeView />;
    return (
      <div
        data-testid="account-landing"
        className="m-6 w-96 max-w-full self-center rounded-lg border border-[var(--border)] bg-[var(--bg-alt)] p-6 shadow"
      >
        <h2 className="text-xl font-semibold">{account.name}</h2>
        <p className="text-sm text-[var(--muted)]">{account.username || strings.sidebarAccounts}</p>
      </div>
    );
  }

  if (libraryIsEmpty(hosts)) return <WelcomeView />;
  const host = hosts.find((h) => h.id === selectedHostId) ?? hosts[0];
  if (!host) return <WelcomeView />;
  return <ConnectionLanding host={host} />;
}
