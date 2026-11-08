import type { ReactNode } from "react";

/** Shared editor primitives (Stage 3) - markup only, no logic. */

export const inputClass =
  "w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm focus:border-[var(--accent)]";

export const buttonClass =
  "rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm hover:bg-[var(--bg-alt)] disabled:opacity-60";

export const primaryButtonClass =
  "rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] hover:opacity-90 disabled:opacity-60";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-lg border border-[var(--border)] p-3">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{title}</legend>
      {children}
    </fieldset>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
  className = "",
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block min-w-0 ${className}`} htmlFor={htmlFor}>
      <span className="mb-1 block text-xs font-medium text-[var(--muted)]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[var(--muted)]">{hint}</span>}
    </label>
  );
}

/** The message under an invalid field (task 3.6). */
export function FieldMessage({ testId, message }: { testId: string; message?: string }) {
  if (!message) return null;
  return (
    <p data-testid={testId} className="mt-1 text-xs text-[var(--danger)]">
      {message}
    </p>
  );
}
