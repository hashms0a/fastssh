/**
 * Pure host/account helpers (task 3.1): name normalisation, validation,
 * credential resolution and duplication. No React, no IPC.
 */
import type { Account, Host } from "../types/models";
import { newId } from "./ids";
import { parseTunnels } from "./tunnels";
import type { ValidationKey } from "./strings";

/** Name is required + unique; spaces collapse to "-" (R1). */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, "-");
}

const BAD_NAME_CHARS = /[*?!#,"']/;

export type HostField = "name" | "group" | "host" | "port" | "tunnels";

export interface FieldError {
  field: HostField;
  messageKey: ValidationKey;
}

/**
 * Rules (plan 3.1): the name is required, unique (case-sensitive, like
 * ssh) and free of * ? ! # , and quotes; the host is always required;
 * the port is 1-65535; every tunnel must parse.
 */
export function validateHost(draft: Host, allHosts: readonly Host[], editingId: string | null): FieldError[] {
  const errors: FieldError[] = [];
  const name = normalizeName(draft.name);
  if (!name) {
    errors.push({ field: "name", messageKey: "nameRequired" });
  } else {
    if (BAD_NAME_CHARS.test(name)) errors.push({ field: "name", messageKey: "nameChars" });
    if (allHosts.some((h) => h.id !== editingId && h.name === name)) {
      errors.push({ field: "name", messageKey: "nameTaken" });
    }
  }
  if (!draft.host.trim()) errors.push({ field: "host", messageKey: "hostRequired" });
  if (!Number.isInteger(draft.port) || draft.port < 1 || draft.port > 65535) {
    errors.push({ field: "port", messageKey: "portRange" });
  }
  if (parseTunnels(draft.tunnels).errors.length > 0) {
    errors.push({ field: "tunnels", messageKey: "tunnelsInvalid" });
  }
  return errors;
}

export function errorsFor(errors: readonly FieldError[], field: HostField): FieldError[] {
  return errors.filter((e) => e.field === field);
}

/** Account wins when it exists (R2); otherwise the host's own values. */
export interface Credentials {
  username: string;
  password: string;
  identity_file: string;
}

export function resolveCredentials(host: Host, accounts: readonly Account[]): Credentials {
  const acc = host.account ? accounts.find((a) => a.name === host.account) : undefined;
  if (!acc) {
    return { username: host.username, password: host.password, identity_file: host.identity_file };
  }
  return { username: acc.username, password: acc.password, identity_file: acc.identity_file };
}

/** "<name>-copy", then "-copy-2", "-copy-3", ... (task 3.7). */
export function duplicateName(base: string, taken: readonly string[]): string {
  const stem = base.replace(/-copy(-\d+)?$/, "");
  const used = new Set(taken);
  let name = `${stem}-copy`;
  for (let n = 2; used.has(name); n += 1) name = `${stem}-copy-${n}`;
  return name;
}

export function duplicateHost(host: Host, allHosts: readonly Host[]): Host {
  return {
    ...host,
    id: newId(),
    name: duplicateName(
      host.name,
      allHosts.map((h) => h.name),
    ),
    local: undefined,
  };
}

export function duplicateAccount(account: Account, allAccounts: readonly Account[]): Account {
  return {
    ...account,
    id: newId(),
    name: duplicateName(
      account.name,
      allAccounts.map((a) => a.name),
    ),
  };
}

export function accountNameTaken(name: string, all: readonly Account[], editingId: string | null): boolean {
  return all.some((a) => a.id !== editingId && a.name === name);
}

/** Hosts linked to this account name (task 3.9 confirm counts, R2). */
export function hostsUsingAccount(hosts: readonly Host[], accountName: string): Host[] {
  if (!accountName) return [];
  return hosts.filter((h) => h.account === accountName);
}

/**
 * Legacy-compatible propagation (R2): every host linked to the OLD name
 * takes the new name plus the account's credentials.
 */
export function applyAccountToHosts(
  hosts: readonly Host[],
  oldName: string,
  account: Account,
): { list: Host[]; changed: number } {
  let changed = 0;
  const list = hosts.map((h) => {
    if (h.account !== oldName) return h;
    changed += 1;
    return {
      ...h,
      account: account.name,
      username: account.username,
      password: account.password,
      identity_file: account.identity_file,
    };
  });
  return { list, changed };
}

/** Unlink (task 3.9 delete): hosts keep their current credentials. */
export function unlinkHostsFromAccount(hosts: readonly Host[], accountName: string): Host[] {
  return hosts.map((h) => (h.account === accountName ? { ...h, account: "" } : h));
}

export function newHost(partial: Partial<Host> = {}): Host {
  return {
    id: newId(),
    name: "",
    group: "",
    host: "",
    port: 22,
    username: "",
    password: "",
    identity_file: "",
    account: "",
    color: "",
    font: "",
    tunnels: "",
    extra_arguments: "",
    ssh_config: "",
    ...partial,
  };
}

export function newAccount(partial: Partial<Account> = {}): Account {
  return { id: newId(), name: "", username: "", password: "", identity_file: "", ...partial };
}
