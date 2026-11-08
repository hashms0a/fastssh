import type { ReactNode } from "react";
import { strings } from "../../lib/strings";
import { inputClass } from "../Editors/fields";

interface CheckProps {
  testId: string;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  /** Tooltip when disabled; defaults to "Coming soon". */
  disabledTitle?: string;
  hint?: string;
}

/** Checkbox row of the Preferences modal; a disabled one says "Coming soon". */
export function Check({ testId, label, checked, onChange, disabled, disabledTitle, hint }: CheckProps) {
  return (
    <label className="flex items-start gap-2 py-1">
      <input
        type="checkbox"
        data-testid={testId}
        checked={checked}
        disabled={disabled}
        title={disabled ? (disabledTitle ?? strings.comingSoon) : undefined}
        className="mt-1 accent-[var(--accent)]"
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="min-w-0 text-sm">
        {label}
        {hint && <span className="block text-xs text-[var(--muted)]">{hint}</span>}
      </span>
    </label>
  );
}

interface TextRowProps {
  testId: string;
  label: string;
  hint?: string;
  /** Uncontrolled by default; pass `value` when the parent owns the field. */
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  /** Blur or Enter: the modal validates the text and may rewrite the field. */
  onCommit: (value: string, el: HTMLInputElement) => void;
  action?: ReactNode;
}

export function TextRow({ testId, label, hint, defaultValue, value, onChange, onCommit, action }: TextRowProps) {
  const commit = (el: HTMLInputElement) => onCommit(el.value, el);
  return (
    <div className="min-w-0">
      <span className="mb-1 block text-xs font-medium text-[var(--muted)]">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="text"
          data-testid={testId}
          aria-label={label}
          defaultValue={defaultValue}
          value={value}
          className={inputClass}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          onBlur={(e) => commit(e.currentTarget)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit(e.currentTarget);
          }}
        />
        {action}
      </div>
      {hint && <span className="mt-1 block text-xs text-[var(--muted)]">{hint}</span>}
    </div>
  );
}
