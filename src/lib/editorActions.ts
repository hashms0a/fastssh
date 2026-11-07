/**
 * Editor commands shared by the header, the landing cards and the context
 * menus (task 3.11). Each one touches only the store, so the components
 * stay markup.
 */
import type { Account, Host } from "../types/models";
import { duplicateAccount, duplicateHost, hostsUsingAccount, newAccount, newHost } from "./hostUtils";
import { removeAccount, removeById, upsertHost } from "./libraryActions";
import { strings } from "./strings";
import { tabCountOf } from "../store/slices/tabsSlice";
import { closeHostTabs } from "../terminal/sessionController";
import { useAppStore } from "../store/useAppStore";

const store = () => useAppStore.getState();

export function addHost(): void {
  store().openEditor({ kind: "host", mode: "add", seed: newHost({ group: store().hosts[0]?.group ?? "" }) });
}

export function editHost(host: Host): void {
  store().openEditor({ kind: "host", mode: "edit", seed: host });
}

/** Task 3.7: the copy opens in add mode; it is saved when the user saves. */
export function duplicateHostAction(host: Host): void {
  const { hosts } = store();
  store().openEditor({ kind: "host", mode: "add", seed: duplicateHost(host, hosts) });
}

/** Task 3.8: confirm, then remove. Open tabs are closed first (Stage 4). */
export async function removeHost(host: Host): Promise<void> {
  const s = store();
  const openTabs = tabCountOf(s, host.id);
  const message =
    openTabs > 0 ? strings.removeConnectionWithTabs(host.name, openTabs) : strings.removeConnectionConfirm(host.name);
  const withTabs = await s.confirm({ title: strings.remove, message });
  if (!withTabs) return;
  closeHostTabs(host.id);
  const ok = await s.saveHosts(removeById(s.hosts, host.id));
  if (s.selectedHostId === host.id) s.selectHost(null);
  if (ok) s.pushToast(strings.removedConnection(host.name));
}

export function addAccount(): void {
  store().openEditor({ kind: "account", mode: "add", seed: newAccount() });
}

export function editAccount(account: Account): void {
  store().openEditor({ kind: "account", mode: "edit", seed: account });
}

export function duplicateAccountAction(account: Account): void {
  const { accounts } = store();
  store().openEditor({ kind: "account", mode: "add", seed: duplicateAccount(account, accounts) });
}

/** Task 3.9 delete: unlink the N hosts that use it (they keep credentials). */
export async function removeAccountAction(account: Account): Promise<void> {
  const s = store();
  const used = hostsUsingAccount(s.hosts, account.name).length;
  const ok = await s.confirm({ title: strings.remove, message: strings.removeAccountConfirm(used) });
  if (!ok) return;
  const res = removeAccount(s.hosts, s.accounts, account);
  const saved = await Promise.all([s.saveAccounts(res.accounts), s.saveHosts(res.hosts)]);
  if (s.selectedAccountId === account.id) s.selectAccount(null);
  if (saved.every(Boolean)) s.pushToast(strings.removedAccount(account.name));
}

/** Used by the landing card / tests: the same save path as the editor. */
export function saveHost(host: Host): Promise<boolean> {
  const s = store();
  return s.saveHosts(upsertHost(s.hosts, host));
}
