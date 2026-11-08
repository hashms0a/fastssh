import { useState, type KeyboardEvent } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { strings } from "../../lib/strings";
import { ipc } from "../../lib/ipc";
import { changeHostsFolder } from "../../lib/hostsFolder";
import { toHex } from "../../lib/colors";
import {
  MAX_FONT_SIZE,
  MAX_SCROLLBACK,
  MIN_FONT_SIZE,
  MIN_SCROLLBACK,
  fontSizeFromText,
  scrollbackDisplay,
  scrollbackFromText,
} from "../../lib/prefs";
import { DEFAULT_SETTINGS } from "../../types/models";
import { useAppStore } from "../../store/useAppStore";
import { buttonClass, primaryButtonClass } from "../Editors/fields";
import { useDialogFocus } from "./dialogFocus";
import { Check, TextRow } from "./prefsFields";

/**
 * Preferences (task 8.1, R18): two tabs, every control live through
 * `updateSettings`, no OK/Apply - Close only. Text fields commit on blur or
 * Enter, so typing "1000" is not clamped to 100 on the way in. `key` is the
 * stored value: a change from elsewhere (Reset, a folder load) re-mounts the
 * field with the new text.
 */
export function PreferencesModal() {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const closePreferences = useAppStore((s) => s.closePreferences);
  const confirm = useAppStore((s) => s.confirm);
  const hydrate = useAppStore((s) => s.hydrate);
  const pushToast = useAppStore((s) => s.pushToast);
  const { box, onKeyDown } = useDialogFocus<HTMLDivElement>();
  const [tab, setTab] = useState<"general" | "appearance">("general");
  // The folder field is the one owned by the modal: Browse fills it before
  // the confirm dialog decides whether the path is real.
  const [folder, setFolder] = useState(settings.hostsFolder);

  const applyFolder = async (value: string, el?: HTMLInputElement | null): Promise<void> => {
    const next = value.trim();
    if (!next || next === settings.hostsFolder) {
      if (el) el.value = settings.hostsFolder;
      setFolder(settings.hostsFolder);
      return;
    }
    const result = await changeHostsFolder({
      folder: next,
      hasLibrary: ipc.folderHasLibrary,
      confirm: (title, message) => confirm({ title, message }),
      setFolder: ipc.setHostsFolder,
      applyReport: hydrate,
      updateSettings,
      toast: pushToast,
    });
    // Cancel or a failed command puts the old path back in the field (8.3).
    if (result === "cancelled" || result === "failed") {
      if (el) el.value = settings.hostsFolder;
      setFolder(settings.hostsFolder);
    }
  };

  const browse = async (): Promise<void> => {
    const picked = await open({ directory: true, defaultPath: settings.hostsFolder });
    if (typeof picked !== "string") return;
    setFolder(picked);
    const el = document.querySelector<HTMLInputElement>('[data-testid="prefs-hosts-folder"]');
    if (el) el.value = picked;
    await applyFolder(picked, el);
  };

  const commitFont = (value: string, el: HTMLInputElement): void => {
    const next = value.trim();
    if (!next) {
      el.value = settings.terminalFont;
      return;
    }
    updateSettings({ terminalFont: next });
    el.value = next;
  };

  const commitFontSize = (value: string, el: HTMLInputElement): void => {
    const next = fontSizeFromText(value);
    if (next === null) {
      el.value = String(settings.terminalFontSize);
      return;
    }
    updateSettings({ terminalFontSize: next });
    el.value = String(next); // shows the clamped value
  };

  const commitScrollback = (value: string, el: HTMLInputElement): void => {
    const next = scrollbackFromText(value);
    if (next === null) {
      el.value = scrollbackDisplay(settings.scrollbackLines);
      return;
    }
    updateSettings({ scrollbackLines: next });
    el.value = scrollbackDisplay(next); // "Unlimited" -> "Unlimited (50000)"
  };

  const onPanelKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.stopPropagation();
      closePreferences();
      return;
    }
    onKeyDown(e);
  };

  const background = toHex(settings.terminalBackgroundColor) ?? DEFAULT_SETTINGS.terminalBackgroundColor;
  const tabClass = (active: boolean) =>
    `rounded-t border-b-2 px-3 py-1.5 text-sm ${
      active ? "border-[var(--accent)] bg-[var(--bg)]" : "border-transparent text-[var(--muted)] hover:bg-[var(--bg)]"
    }`;

  return (
    <div
      data-testid="preferences-overlay"
      className="absolute inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 sm:items-center"
    >
      <div
        ref={box}
        data-testid="preferences-modal"
        role="dialog"
        aria-modal="true"
        aria-label={strings.prefsTitle}
        onKeyDown={onPanelKeyDown}
        className="flex max-h-full w-[34rem] max-w-full flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-alt)] p-4 shadow-xl"
      >
        <h2 data-testid="prefs-title" className="text-lg font-semibold">
          {strings.prefsTitle}
        </h2>
        <div role="tablist" className="flex gap-1 border-b border-[var(--border)]">
          <button
            type="button"
            role="tab"
            data-testid="prefs-tab-general"
            aria-selected={tab === "general"}
            className={tabClass(tab === "general")}
            onClick={() => setTab("general")}
          >
            {strings.prefsTabGeneral}
          </button>
          <button
            type="button"
            role="tab"
            data-testid="prefs-tab-appearance"
            aria-selected={tab === "appearance"}
            className={tabClass(tab === "appearance")}
            onClick={() => setTab("appearance")}
          >
            {strings.prefsTabAppearance}
          </button>
        </div>

        <div className="flex flex-col gap-2 overflow-y-auto">
          {tab === "general" ? (
            <>
              <TextRow
                testId="prefs-hosts-folder"
                label={strings.labelHostsFolder}
                hint={strings.hostsFolderHint}
                value={folder}
                onChange={setFolder}
                onCommit={(value, el) => void applyFolder(value, el)}
                action={
                  <button
                    type="button"
                    data-testid="prefs-browse-folder"
                    className={buttonClass}
                    onClick={() => void browse()}
                  >
                    {strings.browse}
                  </button>
                }
              />
              <Check
                testId="prefs-restore-hosts"
                label={strings.restoreOnStartup}
                checked={settings.restoreHosts}
                onChange={(v) => updateSettings({ restoreHosts: v })}
              />
              <Check
                testId="prefs-sync-config"
                label={strings.syncSshConfig}
                hint={strings.syncSoonHint}
                checked={settings.syncSshConfig}
                disabled
                onChange={() => undefined}
              />
              <Check
                testId="prefs-encrypt"
                label={strings.encryptData}
                hint={strings.encryptSoonHint}
                checked={settings.encryptData}
                disabled
                onChange={() => undefined}
              />
            </>
          ) : (
            <>
              <Check
                testId="prefs-dark-theme"
                label={strings.darkTheme}
                checked={settings.useDarkTheme}
                onChange={(v) => updateSettings({ useDarkTheme: v })}
              />
              <div className="flex items-center gap-2 py-1">
                <span className="min-w-0 flex-1 text-sm">{strings.labelTerminalBackground}</span>
                <input
                  type="color"
                  data-testid="prefs-bg-color"
                  aria-label={strings.labelTerminalBackground}
                  value={background}
                  className="h-8 w-12 rounded-md border border-[var(--border)] bg-[var(--bg)]"
                  onChange={(e) => updateSettings({ terminalBackgroundColor: e.target.value })}
                />
                <button
                  type="button"
                  data-testid="prefs-bg-reset"
                  className={buttonClass}
                  onClick={() => updateSettings({ terminalBackgroundColor: DEFAULT_SETTINGS.terminalBackgroundColor })}
                >
                  {strings.reset}
                </button>
              </div>
              <TextRow
                key={settings.terminalFont}
                testId="prefs-font-family"
                label={strings.labelTerminalFont}
                defaultValue={settings.terminalFont}
                onCommit={commitFont}
              />
              <TextRow
                key={settings.terminalFontSize}
                testId="prefs-font-size"
                label={strings.labelFontSize}
                hint={`${MIN_FONT_SIZE} - ${MAX_FONT_SIZE}`}
                defaultValue={String(settings.terminalFontSize)}
                onCommit={commitFontSize}
              />
              <TextRow
                key={settings.scrollbackLines}
                testId="prefs-scrollback"
                label={strings.labelScrollback}
                hint={strings.scrollbackHint(MIN_SCROLLBACK, MAX_SCROLLBACK)}
                defaultValue={scrollbackDisplay(settings.scrollbackLines)}
                onCommit={commitScrollback}
              />
              <Check
                testId="prefs-bell"
                label={strings.audibleBell}
                checked={settings.audibleBell}
                onChange={(v) => updateSettings({ audibleBell: v })}
              />
            </>
          )}
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            data-testid="prefs-close"
            data-autofocus
            className={primaryButtonClass}
            onClick={closePreferences}
          >
            {strings.close}
          </button>
        </div>
      </div>
    </div>
  );
}
