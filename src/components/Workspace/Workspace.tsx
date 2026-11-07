import { useAppStore } from "../../store/useAppStore";
import { HostNotebook } from "./HostNotebook";
import { WorkspaceEmptyState } from "./WorkspaceEmptyState";

/**
 * Workspace layout (R10, spec 7.1): one HostNotebook for EVERY host that has
 * tabs, always mounted. The selected host's notebook is laid out; the others
 * are `hidden`, which keeps their terminal and PTY alive. A selected host
 * with 0 tabs shows the landing card / welcome screen instead, and a host
 * whose last tab closed unmounts its notebook — there is nothing left to
 * preserve.
 */
export function Workspace() {
  const hosts = useAppStore((s) => s.hosts);
  const tabOrder = useAppStore((s) => s.tabOrder);
  const selectedHostId = useAppStore((s) => s.selectedHostId);
  const selected = hosts.find((h) => h.id === selectedHostId);
  const selectedHasTabs = !!selected && (tabOrder[selected.id]?.length ?? 0) > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {hosts.map((h) =>
        (tabOrder[h.id]?.length ?? 0) > 0 ? (
          <HostNotebook key={h.id} host={h} visible={selectedHasTabs && h.id === selected?.id} />
        ) : null,
      )}
      {!selectedHasTabs && (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <WorkspaceEmptyState />
        </div>
      )}
    </div>
  );
}
