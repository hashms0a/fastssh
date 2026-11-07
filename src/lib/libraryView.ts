import type { Account, Host } from "../types/models";
import { LOCALHOST_ID } from "../types/models";
import { naturalCompare, naturalSort } from "./naturalSort";

/** Pure sidebar list logic (Stage 2), kept out of the components so it
 *  is unit-testable and easy to memoize with useMemo. */

export interface HostGroup {
  name: string;
  hosts: Host[];
}

/** The filter matches name, host, username and group, case-insensitive. */
export function hostMatchesFilter(host: Host, filter: string): boolean {
  const f = filter.trim().toLowerCase();
  if (f === "") return true;
  return [host.name, host.host, host.username, host.group].some((v) => v.toLowerCase().includes(f));
}

export function filterHosts(hosts: readonly Host[], filter: string): Host[] {
  return hosts.filter((h) => hostMatchesFilter(h, filter));
}

/** Group by `group`, names naturally sorted inside each group; the group
 *  list is naturally sorted with the built-in "Local" group pinned first. */
export function groupHosts(hosts: readonly Host[]): HostGroup[] {
  const byName = new Map<string, Host[]>();
  for (const h of hosts) {
    const list = byName.get(h.group);
    if (list) list.push(h);
    else byName.set(h.group, [h]);
  }
  const groups: HostGroup[] = [...byName.entries()].map(([name, list]) => ({
    name,
    hosts: naturalSort(list, (h) => h.name),
  }));
  groups.sort((a, b) => {
    if (a.name === "Local") return b.name === "Local" ? 0 : -1;
    if (b.name === "Local") return 1;
    return naturalCompare(a.name, b.name);
  });
  return groups;
}

/** Filter + group + sort in one memoized step (SourceListView). */
export function visibleGroups(hosts: readonly Host[], filter: string): HostGroup[] {
  return groupHosts(filterHosts(hosts, filter));
}

export function sortedAccounts(accounts: readonly Account[]): Account[] {
  return naturalSort(accounts, (a) => a.name);
}

/** True when the library holds nothing but the in-memory Localhost. */
export function libraryIsEmpty(hosts: readonly Host[]): boolean {
  return hosts.length === 1 && hosts[0]?.id === LOCALHOST_ID;
}
