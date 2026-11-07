/**
 * Tunnel string <-> TunnelRule[] (task 3.2).
 *
 * The on-disk / Host field format is the EasySSH one:
 *   "-L 8080:localhost:80,-R 9000:db:5432"
 * Accepted spellings: the type flag is optional ("-L", "-l", "-L8080:..."
 * without a space, or a bare "8080:localhost:80" = local), and an IPv6
 * destination keeps its brackets ("[::1]"). Invalid entries are reported
 * in order and never dropped silently.
 */
import type { TunnelRule, TunnelType } from "../types/models";
import { newId } from "./ids";

export interface TunnelParse {
  rules: TunnelRule[];
  /** One message per invalid part, in input order (never dropped). */
  errors: string[];
}

const MAX_PORT = 65535;

/** "-L", "-R9000:db:5432", "8080:[::1]:22". */
const SPEC = /^-?(?<type>[lr])?\s*(?<src>\d+)[:=](?<dest>.+)[:=](?<dport>\d+)$/i;

const inRange = (n: number) => Number.isInteger(n) && n >= 1 && n <= MAX_PORT;

/** One comma-separated part. Returns null when it is not a tunnel. */
/**
 * Parses one tunnel part. `index` seeds the rule id so React keys stay stable
 * while a row is edited (a fresh id per parse remounts the row and loses focus).
 */
export function parseTunnel(part: string, index = 0): TunnelRule | null {
  const text = part.trim();
  if (!text) return null;
  const m = SPEC.exec(text);
  const src = m?.groups?.src ?? "";
  const dest = (m?.groups?.dest ?? "").trim();
  const dport = m?.groups?.dport ?? "";
  if (!m || !dest) return null;
  const sourcePort = Number(src);
  const destinationPort = Number(dport);
  if (!inRange(sourcePort) || !inRange(destinationPort)) return null;
  // An IPv6 destination must keep its brackets, a plain host must not have any.
  if (dest.startsWith("[") && !dest.endsWith("]")) return null;
  const type: TunnelType = (m.groups?.type ?? "l").toLowerCase() === "r" ? "remote" : "local";
  return { id: `t${index}`, type, sourcePort, destinationHost: dest, destinationPort };
}

/** "-L 8080:localhost:80" (the ssh flag form used in Host.tunnels). */
export function serializeTunnel(rule: TunnelRule): string {
  return `-${rule.type === "remote" ? "R" : "L"} ${rule.sourcePort}:${rule.destinationHost}:${rule.destinationPort}`;
}

/** "LocalForward 8080 localhost:80" (the ssh_config form, task 3.3). */
export function tunnelForward(rule: TunnelRule): string {
  return `${rule.type === "remote" ? "RemoteForward" : "LocalForward"} ${rule.sourcePort} ${rule.destinationHost}:${rule.destinationPort}`;
}

/** Full string <-> rules. The empty string parses to no rules and no errors. */
export function parseTunnels(text: string): TunnelParse {
  const rules: TunnelRule[] = [];
  const errors: string[] = [];
  for (const [i, part] of text.split(",").entries()) {
    if (!part.trim()) continue;
    const rule = parseTunnel(part, i);
    if (rule) rules.push(rule);
    else errors.push(part.trim());
  }
  return { rules, errors };
}

export function serializeTunnels(rules: readonly TunnelRule[]): string {
  return rules.map(serializeTunnel).join(",");
}

/** Forward lines for the ssh_config block, in rule order. */
export function tunnelForwards(text: string): string[] {
  return parseTunnels(text).rules.map(tunnelForward);
}

export function emptyTunnel(): TunnelRule {
  return { id: newId(), type: "local", sourcePort: 8080, destinationHost: "localhost", destinationPort: 80 };
}
