/**
 * Library mutations as pure functions (plan rule 7): each one returns the
 * next arrays; the component hands them to librarySlice.save*.
 */
import type { Account, Host } from "../types/models";
import { applyAccountToHosts, unlinkHostsFromAccount } from "./hostUtils";

export function upsertHost(hosts: readonly Host[], host: Host): Host[] {
  const at = hosts.findIndex((h) => h.id === host.id);
  if (at === -1) return [...hosts, host];
  const next = hosts.slice();
  next[at] = host;
  return next;
}

export function removeById<T extends { id: string }>(list: readonly T[], id: string): T[] {
  return list.filter((x) => x.id !== id);
}

/** Saving an account also re-links/refreshes the hosts that use it (R2). */
export function upsertAccount(
  hosts: readonly Host[],
  accounts: readonly Account[],
  account: Account,
  oldName: string,
): { accounts: Account[]; hosts: Host[] } {
  const at = accounts.findIndex((a) => a.id === account.id);
  const nextAccounts = at === -1 ? [...accounts, account] : accounts.map((a) => (a.id === account.id ? account : a));
  const { list } = applyAccountToHosts(hosts, oldName, account);
  return { accounts: nextAccounts, hosts: list };
}

/** Deleting an account unlinks its hosts; they keep their credentials. */
export function removeAccount(
  hosts: readonly Host[],
  accounts: readonly Account[],
  account: Account,
): { accounts: Account[]; hosts: Host[] } {
  return { accounts: removeById(accounts, account.id), hosts: unlinkHostsFromAccount(hosts, account.name) };
}
