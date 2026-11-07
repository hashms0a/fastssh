/** ids.ts - one place that makes primary keys (uuid v4 when available). */

export function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  // jsdom/older WebKit fallback: good enough for local-only ids.
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
