/** Natural (human) ordering: db2 before db10, case- and accent-tolerant. */

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Compare two strings the way a human sorts them. Stable across calls. */
export function naturalCompare(a: string, b: string): number {
  return collator.compare(a, b);
}

/** Sort a copy of `items` by the string `key` extracts, naturally. */
export function naturalSort<T>(items: readonly T[], key: (item: T) => string): T[] {
  return [...items].sort((a, b) => naturalCompare(key(a), key(b)));
}
