import { strings } from "../../lib/strings";
import type { DialogRequest } from "../../store/slices/dialogSlice";
import { useAppStore } from "../../store/useAppStore";
import { closeTab, retryTab } from "../../terminal/sessionController";
import { buttonClass, primaryButtonClass } from "../Editors/fields";
import { useDialogFocus } from "./dialogFocus";

type ErrorRequest = Extract<DialogRequest, { kind: "connection-error" }>;

/**
 * The connection error (task 5.7, R11): a friendly line for the kind the
 * prompt watcher detected, with the raw ssh line below it for diagnosis, and
 * Retry / Close. Retry reconnects in the same tab; Close closes it.
 */
export function ConnectionErrorModal({ request }: { request: ErrorRequest }) {
  const dismissDialog = useAppStore((s) => s.dismissDialog);
  const { box, onKeyDown } = useDialogFocus<HTMLDivElement>();

  const close = () => {
    dismissDialog(request.id);
    closeTab(request.tabId);
  };
  const retry = () => {
    dismissDialog(request.id);
    void retryTab(request.tabId);
  };

  const onEscape = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  };

  return (
    <div
      ref={box}
      data-testid="connection-error-modal"
      role="dialog"
      aria-modal="true"
      aria-label={strings.connectionErrorTitle}
      onKeyDown={(e) => {
        onKeyDown(e);
        onEscape(e);
      }}
      className="flex w-[34rem] max-w-full flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-alt)] p-4 shadow-xl"
    >
      <h2 data-testid="connection-error-title" className="text-lg font-semibold">
        {strings.connectionErrorTitle}
      </h2>
      <p data-testid="connection-error-message" className="text-sm">
        {strings.errorKind[request.errorKind]}
      </p>
      {request.errorKind === "hostkey" && <p className="text-xs text-[var(--muted)]">{strings.hostKeyHint}</p>}
      {request.line && (
        <pre
          data-testid="connection-error-line"
          className="max-h-32 overflow-auto rounded-md bg-[var(--bg)] p-2 font-mono text-xs whitespace-pre-wrap"
        >
          {request.line}
        </pre>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" data-testid="connection-error-close" className={buttonClass} onClick={close}>
          {strings.close}
        </button>
        <button
          type="button"
          data-testid="connection-error-retry"
          data-autofocus
          className={primaryButtonClass}
          onClick={retry}
        >
          {strings.retry}
        </button>
      </div>
    </div>
  );
}
