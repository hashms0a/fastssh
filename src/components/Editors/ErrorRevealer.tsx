import { strings } from "../../lib/strings";
import type { FieldError } from "../../lib/hostUtils";

/**
 * Inline banner at the top of the editor listing every validation error
 * (task 3.6). The editor shows it after the first Save click; it stays
 * visible while the user fixes fields.
 */
export function ErrorRevealer({ errors, visible }: { errors: readonly FieldError[]; visible: boolean }) {
  if (!visible || errors.length === 0) return null;
  return (
    <div
      data-testid="editor-errors"
      role="alert"
      className="rounded-md border border-[var(--danger)] bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]"
    >
      <ul className="list-disc space-y-0.5 pl-4">
        {errors.map((e) => (
          <li key={`${e.field}:${e.messageKey}`}>{strings.validation[e.messageKey]}</li>
        ))}
      </ul>
    </div>
  );
}
