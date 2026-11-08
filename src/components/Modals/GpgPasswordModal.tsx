import { useState, type KeyboardEvent } from "react";
import { strings } from "../../lib/strings";
import { ipc } from "../../lib/ipc";
import { logError } from "../../lib/log";
import {
  cancelUnlock,
  disableEncryption,
  enableEncryption,
  passErrorText,
  startEmptyLibrary,
  unlockLibrary,
  type EncryptDeps,
  type UnlockDeps,
} from "../../lib/cryptoActions";
import { useAppStore } from "../../store/useAppStore";
import type { PassModalMode } from "../../store/slices/uiSlice";
import { buttonClass, inputClass, primaryButtonClass } from "../Editors/fields";
import { useDialogFocus } from "./dialogFocus";

/**
 * The passphrase modal (task 10.4, R6), three modes:
 * `unlock`  one field, at startup while the library is locked;
 * `set`     two fields plus the strength hint, from the Encrypt toggle;
 * `disable` one field, the current passphrase to write the plain files back.
 *
 * A wrong passphrase keeps the modal open and the text in the field, so the
 * user can fix a typo. Cancel during unlock asks "Quit FastSSH?", because
 * without the data the app has nothing to show. The passphrase goes straight
 * to Rust and is never stored in the store.
 */
export function GpgPasswordModal({ mode }: { mode: PassModalMode }) {
  const hydrate = useAppStore((s) => s.hydrate);
  const confirm = useAppStore((s) => s.confirm);
  const pushToast = useAppStore((s) => s.pushToast);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const flushSettings = useAppStore((s) => s.flushSettings);
  const closePassModal = useAppStore((s) => s.closePassModal);
  const [pass, setPass] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** Only an unreadable encrypted file offers this, never a wrong passphrase. */
  const [startEmpty, setStartEmpty] = useState(false);
  const { box, onKeyDown } = useDialogFocus<HTMLDivElement>();

  const unlockDeps: UnlockDeps = {
    unlock: ipc.unlockLibrary,
    startEmpty: ipc.startEmptyLibrary,
    hydrate,
    confirm: (title, message) => confirm({ title, message }),
    quit: () => ipc.quit(),
    log: logError,
  };
  const encryptDeps: EncryptDeps = {
    setEncryption: ipc.setEncryption,
    setFlag: (on) => updateSettings({ encryptData: on }),
    flush: flushSettings,
    toast: pushToast,
    log: logError,
  };

  const submit = async (): Promise<void> => {
    setError(null);
    if (mode === "unlock") {
      const r = await unlockLibrary(unlockDeps, pass);
      if (r.outcome === "wrong") {
        setError(strings.gpgWrongPassphrase); // the field keeps its text
        return;
      }
      if (r.outcome === "failed") {
        setError(r.message ?? strings.gpgWrongPassphrase);
        setStartEmpty(true);
      }
      return; // "unlocked" hydrates, and App removes the modal
    }
    if (mode === "set") {
      const r = await enableEncryption(encryptDeps, pass, again);
      if (r.outcome === "on") {
        setPass("");
        setAgain("");
        closePassModal();
        return;
      }
      setError(r.message ?? passErrorText.required);
      return;
    }
    const r = await disableEncryption(encryptDeps, pass);
    if (r.outcome === "off") {
      setPass("");
      closePassModal();
      return;
    }
    setError(r.outcome === "wrong" ? strings.gpgWrongPassphrase : (r.message ?? strings.gpgWrongPassphrase));
  };

  /** Cancel: unlock asks whether to quit (task 10.4); the other two close. */
  const cancel = async (): Promise<void> => {
    setPass("");
    setAgain("");
    if (mode === "unlock") {
      await cancelUnlock(unlockDeps);
      return;
    }
    closePassModal();
  };

  const onPanelKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.stopPropagation();
      void cancel();
      return;
    }
    if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
      e.preventDefault();
      void submit();
      return;
    }
    onKeyDown(e);
  };

  const title =
    mode === "unlock" ? strings.gpgUnlockTitle : mode === "set" ? strings.gpgSetTitle : strings.gpgDisableTitle;
  const hint = mode === "unlock" ? strings.gpgUnlockHint : mode === "set" ? strings.gpgSetHint : strings.gpgDisableHint;
  const action = mode === "unlock" ? strings.gpgUnlock : mode === "set" ? strings.gpgEncrypt : strings.gpgDecrypt;

  return (
    <div className="absolute inset-0 z-[65] flex items-center justify-center bg-black/40 p-4">
      <div
        ref={box}
        data-testid="gpg-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={onPanelKeyDown}
        className="flex w-96 max-w-full flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-alt)] p-4 shadow-xl"
      >
        <h2 data-testid="gpg-title" className="text-lg font-semibold">
          {title}
        </h2>
        <p data-testid="gpg-hint" className="text-sm text-[var(--muted)]">
          {hint}
        </p>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--muted)]">{strings.gpgPassphrase}</span>
          <input
            type="password"
            data-testid="gpg-pass"
            data-autofocus
            aria-label={strings.gpgPassphrase}
            className={inputClass}
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        {mode === "set" && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--muted)]">{strings.gpgPassphraseAgain}</span>
            <input
              type="password"
              data-testid="gpg-pass-again"
              aria-label={strings.gpgPassphraseAgain}
              className={inputClass}
              value={again}
              onChange={(e) => setAgain(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <span className="mt-1 block text-xs text-[var(--muted)]">{strings.gpgStrengthHint}</span>
          </label>
        )}
        {error && (
          <p data-testid="gpg-error" className="text-sm text-[var(--danger)]">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          {startEmpty && (
            <button
              type="button"
              data-testid="gpg-start-empty"
              className={buttonClass}
              onClick={() => void startEmptyLibrary(unlockDeps)}
            >
              {strings.gpgStartEmpty}
            </button>
          )}
          <button type="button" data-testid="gpg-cancel" className={buttonClass} onClick={() => void cancel()}>
            {strings.cancel}
          </button>
          <button
            type="button"
            data-testid="gpg-submit"
            className={primaryButtonClass}
            disabled={!pass}
            onClick={() => void submit()}
          >
            {action}
          </button>
        </div>
      </div>
    </div>
  );
}
