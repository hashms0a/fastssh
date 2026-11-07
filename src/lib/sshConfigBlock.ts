/**
 * The live ssh_config block (task 3.3, R7 preview).
 *
 * syncBlock rewrites ONLY the managed lines (Host, HostName, User, Port,
 * IdentityFile) plus the LocalForward/RemoteForward group and keeps every
 * other line - comments included - in order. Managed lines are emitted in
 * a fixed order at the top (plan note: acceptable and predictable).
 */
import type { Host } from "../types/models";
import { tunnelForwards } from "./tunnels";

export interface BlockFields {
  name: string;
  host: string;
  port: number;
  username: string;
  identityFile: string;
  /** e.g. ["LocalForward 8080 localhost:80", ...] */
  forwards: string[];
}

const MANAGED = ["host", "hostname", "user", "port", "identityfile"] as const;
const FORWARD = /^\s*(localforward|remoteforward)\b/i;

const keyOf = (line: string) =>
  line
    .trim()
    .split(/[\s=]+/, 1)[0]
    ?.toLowerCase() ?? "";
const quote = (v: string) => (/\s/.test(v) ? `"${v}"` : v);

const isManaged = (line: string) => (MANAGED as readonly string[]).includes(keyOf(line));

export function syncBlock(block: string, f: BlockFields): string {
  const managed: Record<string, string> = {
    host: `Host ${f.name}`,
    hostname: f.host ? `    HostName ${f.host}` : "",
    user: f.username ? `    User ${f.username}` : "",
    port: `    Port ${f.port}`,
    identityfile: f.identityFile ? `    IdentityFile ${quote(f.identityFile)}` : "",
  };
  const others = block
    .split("\n")
    .filter((l) => !isManaged(l) && !FORWARD.test(l))
    .filter((l, i, arr) => !(l.trim() === "" && i === arr.length - 1));
  const head = MANAGED.map((k) => managed[k]).filter(Boolean);
  const fwd = f.forwards.map((x) => `    ${x}`);
  return [...head, ...fwd, ...others].join("\n");
}

/** The block the editor previews for a draft host (empty block -> generated). */
export function blockForHost(host: Host): string {
  return syncBlock(host.ssh_config, {
    name: host.name,
    host: host.host,
    port: host.port,
    username: host.username,
    identityFile: host.identity_file,
    forwards: tunnelForwards(host.tunnels),
  });
}
