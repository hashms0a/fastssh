import { useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { Host } from "../../types/models";
import { strings } from "../../lib/strings";
import { normalizeName, resolveCredentials, validateHost } from "../../lib/hostUtils";
import type { Credentials, FieldError, HostField } from "../../lib/hostUtils";
import { blockForHost } from "../../lib/sshConfigBlock";
import { upsertHost, removeById } from "../../lib/libraryActions";
import { useAppStore } from "../../store/useAppStore";
import { ErrorRevealer } from "./ErrorRevealer";
import { TunnelsEditor } from "./TunnelsEditor";
import { Field, FieldMessage, Section, buttonClass, inputClass, primaryButtonClass } from "./fields";
import type { EditorMode } from "../../store/slices/uiSlice";

/**
 * Add/edit a host (task 3.4): Basic / Appearance / Tunnels / Advanced
 * sections, inline validation (task 3.6) and a live ssh_config block.
 * Saves immediately; Cancel discards the draft.
 */
export function ConnectionEditor({ seed, mode }: { seed: Host; mode: EditorMode }) {
  const hosts = useAppStore((s) => s.hosts);
  const accounts = useAppStore((s) => s.accounts);
  const encryptData = useAppStore((s) => s.settings.encryptData);
  const saveHosts = useAppStore((s) => s.saveHosts);
  const closeEditor = useAppStore((s) => s.closeEditor);
  const pushToast = useAppStore((s) => s.pushToast);
  const selectHost = useAppStore((s) => s.selectHost);
  const confirm = useAppStore((s) => s.confirm);

  const [draft, setDraft] = useState<Host>(seed);
  const [showPassword, setShowPassword] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);

  const errors = useMemo(
    () => validateHost(draft, hosts, mode === "edit" ? seed.id : null),
    [draft, hosts, mode, seed.id],
  );
  const cred: Credentials = resolveCredentials(draft, accounts);
  const accountChosen = draft.account !== "";
  const errorOn = (field: HostField) => (revealed ? errors.find((e) => e.field === field)?.messageKey : undefined);
  const patch = (p: Partial<Host>) => setDraft((d) => ({ ...d, ...p }));
  // Task 3.6: the first invalid field gets the caret.
  const focusField = (field: HostField) =>
    document.querySelector<HTMLElement>(`[data-testid="field-${field}"]`)?.focus();

  const onSave = async () => {
    if (saving) return;
    if (errors.length > 0) {
      setRevealed(true);
      focusField((errors[0] as FieldError).field);
      return;
    }
    const next: Host = { ...draft, name: normalizeName(draft.name), host: draft.host.trim() };
    setSaving(true);
    const ok = await saveHosts(upsertHost(hosts, next));
    setSaving(false);
    // The landing card follows what you just saved.
    if (ok) selectHost(next.id);
    if (ok) pushToast(strings.savedConnection(next.name));
    closeEditor();
  };

  const onDelete = async () => {
    if (!(await confirm({ title: strings.remove, message: strings.removeConnectionConfirm(draft.name) }))) return;
    const ok = await saveHosts(removeById(hosts, draft.id));
    if (useAppStore.getState().selectedHostId === draft.id) selectHost(null); // task 3.8
    if (ok) pushToast(strings.removedConnection(draft.name));
    closeEditor();
  };

  const browse = async () => {
    const picked = await open({ multiple: false, directory: false, defaultPath: "~/.ssh" });
    if (typeof picked === "string" && picked) patch({ identity_file: picked }); // task 3.5: Cancel keeps the field
  };

  const message = (field: HostField, testId: string) => {
    const key = errorOn(field);
    return <FieldMessage testId={testId} message={key ? strings.validation[key] : undefined} />;
  };

  return (
    <div
      data-testid="connection-editor"
      data-name={draft.name}
      className="flex max-h-full w-[38rem] max-w-full flex-col gap-3 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-alt)] p-4 shadow-xl"
    >
      <h2 data-testid="editor-title" className="text-lg font-semibold">
        {mode === "add" ? strings.editorNewConnection : strings.editorEditConnection}
      </h2>
      <ErrorRevealer errors={errors} visible={revealed} />
      {mode === "edit" && <p className="text-xs text-[var(--muted)]">{strings.newTabsNote}</p>}

      <Section title={strings.sectionBasic}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={strings.labelName} htmlFor="ce-name">
            <input
              id="ce-name"
              data-testid="field-name"

              aria-invalid={errorOn("name") !== undefined}
              className={inputClass}
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
            {message("name", "error-name")}
          </Field>
          <Field label={strings.labelGroup} htmlFor="ce-group">
            <input
              id="ce-group"
              data-testid="field-group"
              list="group-options"
              className={inputClass}
              value={draft.group}
              onChange={(e) => patch({ group: e.target.value })}
            />
            <datalist data-testid="group-options" id="group-options">
              {[...new Set(hosts.map((h) => h.group).filter(Boolean))].map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </Field>
          <Field label={strings.labelHost} htmlFor="ce-host">
            <input
              id="ce-host"
              data-testid="field-host"

              aria-invalid={errorOn("host") !== undefined}
              className={inputClass}
              value={draft.host}
              onChange={(e) => patch({ host: e.target.value })}
            />
            {message("host", "error-host")}
          </Field>
          <Field label={strings.labelPort} htmlFor="ce-port">
            <input
              id="ce-port"
              data-testid="field-port"

              type="number"
              aria-invalid={errorOn("port") !== undefined}
              className={inputClass}
              value={draft.port}
              onChange={(e) => patch({ port: Number(e.target.value) })}
            />
            {message("port", "error-port")}
          </Field>
          <Field label={strings.labelAccount} htmlFor="ce-account" className="col-span-2">
            <select
              id="ce-account"
              data-testid="field-account"
              className={inputClass}
              value={draft.account}
              onChange={(e) => patch({ account: e.target.value })}
            >
              <option value="">{strings.accountNone}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.name}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={strings.labelUsername} htmlFor="ce-username">
            <input
              id="ce-username"
              data-testid="field-username"
              disabled={accountChosen}
              className={inputClass}
              value={cred.username}
              onChange={(e) => patch({ username: e.target.value })}
            />
          </Field>
          <Field
            label={strings.labelPassword}
            htmlFor="ce-password"
            hint={encryptData ? undefined : strings.passwordHint}
          >
            <div className="flex gap-1">
              <input
                id="ce-password"
                data-testid="field-password"
                type={showPassword ? "text" : "password"}
                disabled={accountChosen}
                className={inputClass}
                value={cred.password}
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
          <Field label={strings.labelIdentity} htmlFor="ce-identity" className="col-span-2">
            <div className="flex gap-1">
              <input
                id="ce-identity"
                data-testid="field-identity"
                disabled={accountChosen}
                className={inputClass}
                value={cred.identity_file}
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

      <Section title={strings.sectionAppearance}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={strings.labelColor} htmlFor="ce-color">
            <div className="flex items-center gap-2">
              <input
                id="ce-color"
                data-testid="field-color"
                type="color"
                disabled={draft.color === ""}
                className="h-8 w-12 rounded border border-[var(--border)] bg-[var(--bg)]"
                value={draft.color || "#3daee9"}
                onChange={(e) => patch({ color: e.target.value })}
              />
              <label className="flex items-center gap-1 text-xs text-[var(--muted)]">
                <input
                  type="checkbox"
                  data-testid="color-default"
                  checked={draft.color === ""}
                  onChange={(e) => patch({ color: e.target.checked ? "" : "#3daee9" })}
                />
                {strings.useDefault}
              </label>
            </div>
          </Field>
          <Field label={strings.labelFont} htmlFor="ce-font" hint='e.g. "Ubuntu Mono 13"'>
            <div className="flex items-center gap-2">
              <input
                id="ce-font"
                data-testid="field-font"
                disabled={draft.font === ""}
                className={inputClass}
                value={draft.font}
                onChange={(e) => patch({ font: e.target.value })}
              />
              <label className="flex shrink-0 items-center gap-1 text-xs text-[var(--muted)]">
                <input
                  type="checkbox"
                  data-testid="font-default"
                  checked={draft.font === ""}
                  onChange={(e) => patch({ font: e.target.checked ? "" : "Ubuntu Mono 13" })}
                />
                {strings.useDefault}
              </label>
            </div>
          </Field>
        </div>
      </Section>

      <Section title={strings.sectionTunnels}>
        <div tabIndex={-1} data-testid="field-tunnels">
          <TunnelsEditor value={draft.tunnels} onChange={(tunnels) => patch({ tunnels })} showErrors={revealed} />
        </div>
        {message("tunnels", "error-tunnels")}
      </Section>

      <Section title={strings.sectionAdvanced}>
        <div className="grid gap-3">
          <Field label={strings.labelExtraArgs} htmlFor="ce-extra" hint={strings.extraArgsHint}>
            <input
              id="ce-extra"
              data-testid="field-extra"
              className={`${inputClass} font-mono`}
              value={draft.extra_arguments}
              onChange={(e) => patch({ extra_arguments: e.target.value })}
            />
          </Field>
          <Field label={strings.labelSshConfig} htmlFor="ce-block">
            <textarea
              id="ce-block"
              data-testid="field-ssh-config"
              rows={7}
              spellCheck={false}
              className={`${inputClass} font-mono`}
              value={blockForHost(draft)}
              onChange={(e) => patch({ ssh_config: e.target.value })}
            />
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
