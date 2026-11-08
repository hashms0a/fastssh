import { strings } from "../../lib/strings";
import type { DialogRequest } from "../../store/slices/dialogSlice";
import { useAppStore } from "../../store/useAppStore";
import { writeTab } from "../../terminal/promptActions";
import { buttonClass, primaryButtonClass } from "../Editors/fields";
import { useDialogFocus } from "./dialogFocus";

type FingerprintRequest = Extract<DialogRequest, { kind: "fingerprint" }>;

/**
 * The fingerprint question (task 5.6, R11): ssh asks "Are you sure you want
 * to continue connecting (yes/no/[fingerprint])?" and FastSSH answers it with
 * Yes / No, which write "yes\n" / "no\n" into the tab. The raw lines are
 * shown so the user can read the key type and the fingerprint.
 */
export function FingerprintModal({ request }: { request: FingerprintRequest }) {
  const dismissDialog = useAppStore((s) => s.dismissDialog);
  const { box, onKeyDown } = useDialogFocus<HTMLDivElement>();

  const answer = (text: string) => {
    const st = useAppStore.getState();
    const tab = st.tabs[request.tabId];
    if (tab) writeTab(request.tabId, tab.sessionId, text);
    dismissDialog(request.id);
  };

  const onEscape = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      answer("no\n");
    }
  };

  return (
    <div
      ref={box}
      data-testid="fingerprint-modal"
      role="dialog"
      aria-modal="true"
      aria-label={strings.fingerprintTitle}
      onKeyDown={(e) => {
        onKeyDown(e);
        onEscape(e);
      }}
      className="flex w-[34rem] max-w-full flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-alt)] p-4 shadow-xl"
    >
      <h2 data-testid="fingerprint-title" className="text-lg font-semibold">
        {strings.fingerprintTitle}
      </h2>
      <pre
        data-testid="fingerprint-text"
        className="max-h-40 overflow-auto rounded-md bg-[var(--bg)] p-2 font-mono text-xs whitespace-pre-wrap"
      >
        {request.text}
      </pre>
      <p className="text-sm text-[var(--muted)]">{strings.fingerprintHint}</p>
      <div className="flex justify-end gap-2">
        <button type="button" data-testid="fingerprint-no" className={buttonClass} onClick={() => answer("no\n")}>
          {strings.no}
        </button>
        <button
          type="button"
          data-testid="fingerprint-yes"
          data-autofocus
          className={primaryButtonClass}
          onClick={() => answer("yes\n")}
        >
          {strings.yes}
        </button>
      </div>
    </div>
  );
}
