import type { Host } from "../../types/models";
import { strings } from "../../lib/strings";
import { useAppStore } from "../../store/useAppStore";

/**
 * The landing card for a selected host with no tabs (R10): name,
 * user@host:port, and Connect / Edit / Remove. Connect wires to the PTY
 * in Stage 4, Edit/Remove to the editors in Stage 3.
 */
export function ConnectionLanding({ host }: { host: Host }) {
  const pushToast = useAppStore((s) => s.pushToast);
  const soon = () => pushToast(strings.comingSoon);
  return (
    <div
      data-testid="connection-landing"
      data-name={host.name}
      className="m-6 flex w-96 max-w-full flex-col gap-4 self-center rounded-lg border border-[var(--border)] bg-[var(--bg-alt)] p-6 shadow"
    >
      <div>
        <h2 data-testid="landing-name" className="text-xl font-semibold">
          {host.name}
        </h2>
        <p className="text-sm text-[var(--muted)]">{strings.hostSubtitle(host)}</p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          data-testid="landing-connect"
          className="flex-1 rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
          onClick={soon}
        >
          {strings.connect}
        </button>
        <button
          type="button"
          data-testid="landing-edit"
          className="flex-1 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--bg)]"
          onClick={soon}
        >
          {strings.edit}
        </button>
        <button
          type="button"
          data-testid="landing-remove"
          className="flex-1 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--bg)]"
          onClick={soon}
        >
          {strings.remove}
        </button>
      </div>
    </div>
  );
}
