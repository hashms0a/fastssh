import type { TunnelRule } from "../../types/models";
import { strings } from "../../lib/strings";
import { emptyTunnel, parseTunnel, serializeTunnel } from "../../lib/tunnels";
import { inputClass } from "./fields";

interface Props {
  /** Host.tunnels verbatim ("part,part"). */
  value: string;
  onChange: (text: string) => void;
  /** Show the red ring on unparsable parts (revealed by the first Save). */
  showErrors?: boolean;
}

/**
 * Tunnel rows (task 3.4): type / source port / destination host /
 * destination port, add and remove. Every part of the string keeps its
 * slot, so an invalid part is editable instead of vanishing (task 3.2).
 */
export function TunnelsEditor({ value, onChange, showErrors = false }: Props) {
  const parts = value
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const setPart = (i: number, text: string) => {
    const next = parts.slice();
    next[i] = text;
    onChange(next.join(","));
  };
  const patchRule = (i: number, rule: TunnelRule, patch: Partial<TunnelRule>) =>
    setPart(i, serializeTunnel({ ...rule, ...patch }));

  return (
    <div className="space-y-2">
      {parts.map((part, i) => {
        const rule = parseTunnel(part, i);
        const remove = (
          <button
            type="button"
            data-testid={`tunnel-remove-${i}`}
            aria-label={`${strings.remove} ${strings.sectionTunnels} ${i + 1}`}
            className="self-end rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--bg-alt)]"
            onClick={() => onChange(parts.filter((_, j) => j !== i).join(","))}
          >
            &times;
          </button>
        );
        if (!rule) {
          return (
            <div key={i} className="flex gap-2" data-testid={`tunnel-row-${i}`} data-invalid="true">
              <input
                type="text"
                data-testid={`tunnel-raw-${i}`}
                aria-invalid
                className={`${inputClass} border-[var(--danger)] font-mono`}
                value={part}
                onChange={(e) => setPart(i, e.target.value)}
              />
              {remove}
            </div>
          );
        }
        return (
          <div key={rule.id} className="flex flex-wrap items-end gap-2" data-testid={`tunnel-row-${i}`}>
            <label className="w-28">
              <span className="mb-1 block text-xs text-[var(--muted)]">Type</span>
              <select
                data-testid={`tunnel-type-${i}`}
                className={inputClass}
                value={rule.type}
                onChange={(e) => patchRule(i, rule, { type: e.target.value as TunnelRule["type"] })}
              >
                <option value="local">-L local</option>
                <option value="remote">-R remote</option>
              </select>
            </label>
            <label className="w-28">
              <span className="mb-1 block text-xs text-[var(--muted)]">Source port</span>
              <input
                type="number"
                data-testid={`tunnel-source-${i}`}
                className={inputClass}
                value={rule.sourcePort}
                onChange={(e) => patchRule(i, rule, { sourcePort: Number(e.target.value) })}
              />
            </label>
            <label className="min-w-32 flex-1">
              <span className="mb-1 block text-xs text-[var(--muted)]">Destination host</span>
              <input
                type="text"
                data-testid={`tunnel-dest-host-${i}`}
                className={inputClass}
                value={rule.destinationHost}
                onChange={(e) => patchRule(i, rule, { destinationHost: e.target.value })}
              />
            </label>
            <label className="w-28">
              <span className="mb-1 block text-xs text-[var(--muted)]">Dest. port</span>
              <input
                type="number"
                data-testid={`tunnel-dest-port-${i}`}
                className={inputClass}
                value={rule.destinationPort}
                onChange={(e) => patchRule(i, rule, { destinationPort: Number(e.target.value) })}
              />
            </label>
            {remove}
          </div>
        );
      })}

      <div className="flex items-center gap-3">
        <button
          type="button"
          data-testid="tunnel-add"
          className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--bg-alt)]"
          onClick={() => onChange([...parts, serializeTunnel(emptyTunnel())].join(","))}
        >
          {strings.addTunnel}
        </button>
        {showErrors && parts.length === 0 && (
          <span className="text-xs text-[var(--muted)]">{strings.validation.tunnelsInvalid}</span>
        )}
      </div>
    </div>
  );
}
