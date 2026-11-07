import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { Account } from "../../types/models";
import { strings } from "../../lib/strings";
import { accountNameTaken, hostsUsingAccount } from "../../lib/hostUtils";
import { removeAccount, upsertAccount } from "../../lib/libraryActions";
import { useAppStore } from "../../store/useAppStore";
import { Field, FieldMessage, Section, buttonClass, inputClass, primaryButtonClass } from "./fields";
import type { EditorMode } from "../../store/slices/uiSlice";

/**
 * Add/edit a shared account (task 3.9, R2). Saving an existing account
 * copies its username/password/identity file onto every host linked to
 * the OLD name and re-points them at the new name. Deleting unlinks the
 * hosts, which keep the credentials they had.
 */
export function AccountEditor({ seed, mode }: { seed: Account; mode: EditorMode }) {
  const hosts = useAppStore((s) => s.hosts);
  const accounts = useAppStore((s) => s.accounts);
  const saveAccounts = useAppStore((s) => s.saveAccounts);
  const selectAccount = useAppStore((s) => s.selectAccount);
  const saveHosts = useAppStore((s) => s.saveHosts);
  const closeEditor = useAppStore((s) => s.closeEditor);
  const pushToast = useAppStore((s) => s.pushToast);
  const confirm = useAppStore((s) => s.confirm);
  const encryptData = useAppStore((s) => s.settings.encryptData);

  const [draft, setDraft] = useState<Account>(seed);
  const [showPassword, setShowPassword] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);

  const nameTaken = accountNameTaken(draft.name, accounts, mode === "edit" ? seed.id : null);
  const nameMissing = draft.name.trim() === "";
  const patch = (p: Partial<Account>) => setDraft((d) => ({ ...d, ...p }));

  const onSave = async () => {
    if (saving) return;
    if (nameMissing || nameTaken) {
      setRevealed(true);
      return;
    }
    const next: Account = { ...draft, name: draft.name.trim() };
    setSaving(true);
    const res = upsertAccount(hosts, accounts, next, seed.name);
    const ok = await Promise.all([saveAccounts(res.accounts), saveHosts(res.hosts)]);
    setSaving(false);
    // The landing card follows what you just saved.
    if (ok.every(Boolean)) selectAccount(next.id);
    if (ok.every(Boolean)) pushToast(strings.savedAccount(next.name));
    closeEditor();
  };

  const onDelete = async () => {
    const used = hostsUsingAccount(hosts, draft.name).length;
    if (!(await confirm({ title: strings.remove, message: strings.removeAccountConfirm(used) }))) return;
    const res = removeAccount(hosts, accounts, draft);
    const ok = await Promise.all([saveAccounts(res.accounts), saveHosts(res.hosts)]);
    if (ok.every(Boolean)) pushToast(strings.removedAccount(draft.name));
    closeEditor();
  };

  const browse = async () => {
    const picked = await open({ multiple: false, directory: false, defaultPath: "~/.ssh" });
    if (typeof picked === "string" && picked) patch({ identity_file: picked });
  };

  return (
    <div
      data-testid="account-editor"
      data-name={draft.name}
      className="flex max-h-full w-[30rem] max-w-full flex-col gap-3 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-alt)] p-4 shadow-xl"
    >
      <h2 data-testid="editor-title" className="text-lg font-semibold">
        {mode === "add" ? strings.editorNewAccount : strings.editorEditAccount}
      </h2>
      {revealed && (nameMissing || nameTaken) && (
        <div
          data-testid="editor-errors"
          role="alert"
          className="rounded-md border border-[var(--danger)] bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]"
        >
          {nameMissing ? strings.validation.accountNameRequired : strings.validation.nameTaken}
        </div>
      )}

      <Section title={strings.sectionBasic}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={strings.labelName} htmlFor="ae-name" className="col-span-2">
            <input
              id="ae-name"
              data-testid="field-name"
              aria-invalid={revealed && (nameMissing || nameTaken)}
              className={inputClass}
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
            <FieldMessage
              testId="error-name"
              message={
                revealed && nameMissing
                  ? strings.validation.accountNameRequired
                  : revealed && nameTaken
                    ? strings.validation.nameTaken
                    : undefined
              }
            />
          </Field>
          <Field label={strings.labelUsername} htmlFor="ae-username">
            <input
              id="ae-username"
              data-testid="field-username"
              className={inputClass}
              value={draft.username}
              onChange={(e) => patch({ username: e.target.value })}
            />
          </Field>
          <Field
            label={strings.labelPassword}
            htmlFor="ae-password"
            hint={encryptData ? undefined : strings.passwordHint}
          >
            <div className="flex gap-1">
              <input
                id="ae-password"
                data-testid="field-password"
                type={showPassword ? "text" : "password"}
                className={inputClass}
                value={draft.password}
                onChange={(e) => patch({ password: e.target.value })}
              />
              <button
                type="button"
                data-testid="password-toggle"
                className="shrink-0 rounded-md border border-[var(--border)] px-2 text-xs hover:bg-[var(--bg)]"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? strings.hide : strings.show}
              </button>
            </div>
          </Field>
          <Field label={strings.labelIdentity} htmlFor="ae-identity" className="col-span-2">
            <div className="flex gap-1">
              <input
                id="ae-identity"
                data-testid="field-identity"
                className={inputClass}
                value={draft.identity_file}
                onChange={(e) => patch({ identity_file: e.target.value })}
              />
              <button
                type="button"
                data-testid="identity-browse"
                className="shrink-0 rounded-md border border-[var(--border)] px-2 text-sm hover:bg-[var(--bg)]"
                onClick={() => void browse()}
              >
                {strings.browse}
              </button>
            </div>
          </Field>
        </div>
      </Section>

      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="editor-save"
          disabled={saving}
          className={primaryButtonClass}
          onClick={() => void onSave()}
        >
          {strings.save}
        </button>
        <button type="button" data-testid="editor-cancel" className={buttonClass} onClick={closeEditor}>
          {strings.cancel}
        </button>
        {mode === "edit" && (
          <button
            type="button"
            data-testid="editor-delete"
            className={`${buttonClass} ml-auto text-[var(--danger)]`}
            onClick={() => void onDelete()}
          >
            {strings.remove}
          </button>
        )}
      </div>
    </div>
  );
}
