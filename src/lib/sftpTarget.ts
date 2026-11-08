/**
 * The real target of a host for "Show in File Browser" (task 7.4, R16).
 *
 * Two things make the record's own fields wrong:
 *   - a linked account supplies the username (R2), and
 *   - in sync mode ssh runs `ssh <name>`, so the ssh_config block's
 *     HostName/Port/User decide where the connection actually goes; the
 *     alias is not a resolvable address.
 */
import type { Account, Host } from "../types/models";
import { resolveCredentials } from "./hostUtils";

export interface BrowserTarget {
  user: string;
  host: string;
  port: number;
}

/**
 * Value of the first `Key value` / `Key=value` line of an ssh_config block,
 * with a quoted value unquoted. `null` when the key is absent or empty.
 */
export function blockValue(block: string, key: string): string | null {
  const want = key.toLowerCase();
  for (const raw of block.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const name = line.split(/[\s=]+/, 1)[0]?.toLowerCase();
    if (name !== want) continue;
    const value = line
      .slice(name?.length ?? 0)
      .replace(/^[\s=]+/, "")
      .trim();
    if (!value) return null;
    return value.replace(/^"([^"]*)"$/, "$1");
  }
  return null;
}

const validPort = (raw: string | null, fallback: number): number => {
  const n = raw === null ? NaN : Number(raw);
  return Number.isInteger(n) && n > 0 && n <= 65535 ? n : fallback;
};

export function browserTarget(host: Host, accounts: readonly Account[], syncSshConfig: boolean): BrowserTarget {
  const username = resolveCredentials(host, accounts).username;
  if (!syncSshConfig || !host.ssh_config.trim()) {
    return { user: username, host: host.host, port: host.port };
  }
  return {
    user: blockValue(host.ssh_config, "User") ?? username,
    host: blockValue(host.ssh_config, "HostName") ?? host.host,
    port: validPort(blockValue(host.ssh_config, "Port"), host.port),
  };
}
