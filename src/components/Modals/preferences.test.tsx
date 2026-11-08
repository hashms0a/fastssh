import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import { PreferencesModal } from "./PreferencesModal";
import { ModalHost } from "./ModalHost";
import { useAppStore } from "../../store/useAppStore";
import { DEFAULT_SETTINGS } from "../../types/models";
import { emptyReport, installIpcMock } from "../../test/ipcMock";
import type { LoadReport } from "../../lib/ipc";

const NEW_FOLDER = "/home/dev/library";

/** updateSettings with a spy that still runs the real implementation. */
function watchUpdates() {
  const spy = vi.spyOn(useAppStore.getState(), "updateSettings");
  return spy;
}

beforeEach(() => {
  installIpcMock();
  useAppStore.getState().hydrate(emptyReport({ settings: DEFAULT_SETTINGS }));
  useAppStore.setState({ preferencesOpen: true, modals: [], dialogs: [], toasts: [] });
});

describe("Preferences modal (task 8.1)", () => {
  it("the Appearance controls call updateSettings with their value", () => {
    const spy = watchUpdates();
    render(<PreferencesModal />);
    fireEvent.click(screen.getByTestId("prefs-tab-appearance"));

    fireEvent.click(screen.getByTestId("prefs-dark-theme"));
    expect(spy).toHaveBeenCalledWith({ useDarkTheme: false });

    fireEvent.change(screen.getByTestId("prefs-bg-color"), { target: { value: "#002b36" } });
    expect(spy).toHaveBeenCalledWith({ terminalBackgroundColor: "#002b36" });

    fireEvent.click(screen.getByTestId("prefs-bg-reset"));
    expect(spy).toHaveBeenCalledWith({
      terminalBackgroundColor: DEFAULT_SETTINGS.terminalBackgroundColor,
    });

    fireEvent.click(screen.getByTestId("prefs-bell"));
    expect(spy).toHaveBeenCalledWith({ audibleBell: false });
  });

  it("font and font size apply on Enter, not on every keystroke", () => {
    const spy = watchUpdates();
    render(<PreferencesModal />);
    fireEvent.click(screen.getByTestId("prefs-tab-appearance"));

    const size = screen.getByTestId("prefs-font-size") as HTMLInputElement;
    fireEvent.change(size, { target: { value: "2" } });
    fireEvent.change(size, { target: { value: "20" } });
    expect(spy).not.toHaveBeenCalledWith({ terminalFontSize: 2 });
    fireEvent.keyDown(size, { key: "Enter" });
    expect(spy).toHaveBeenCalledWith({ terminalFontSize: 20 });

    const family = screen.getByTestId("prefs-font-family") as HTMLInputElement;
    fireEvent.change(family, { target: { value: "DejaVu Sans Mono" } });
    fireEvent.blur(family);
    expect(spy).toHaveBeenCalledWith({ terminalFont: "DejaVu Sans Mono" });
  });

  it("scrollback: Unlimited maps to -1 and back, a number is clamped", () => {
    const spy = watchUpdates();
    render(<PreferencesModal />);
    fireEvent.click(screen.getByTestId("prefs-tab-appearance"));
    // The field re-mounts when its stored value changes, so look it up again
    // after every commit.
    const commit = (text: string) => {
      const field = screen.getByTestId("prefs-scrollback") as HTMLInputElement;
      fireEvent.change(field, { target: { value: text } });
      fireEvent.blur(field);
      return field;
    };

    expect(commit("Unlimited").value).toBe("Unlimited (50000)");
    expect(spy).toHaveBeenCalledWith({ scrollbackLines: -1 });

    expect(commit("1000").value).toBe("1000");
    expect(spy).toHaveBeenCalledWith({ scrollbackLines: 1000 });

    expect(commit("99999999").value).toBe("100000");
    expect(spy).toHaveBeenCalledWith({ scrollbackLines: 100000 });

    // Garbage is refused and the field goes back to the stored value.
    expect(commit("abc").value).toBe("100000");
    expect(useAppStore.getState().settings.scrollbackLines).toBe(100000);
  });

  it("General: Restore toggles; Encrypt opens the passphrase modal", () => {
    const spy = watchUpdates();
    render(<PreferencesModal />);
    fireEvent.click(screen.getByTestId("prefs-restore-hosts"));
    expect(spy).toHaveBeenCalledWith({ restoreHosts: true });
    // Stage 10 un-disabled the Encrypt switch: ticking it asks for a
    // passphrase first, it does not write the flag itself.
    const box = screen.getByTestId("prefs-encrypt") as HTMLInputElement;
    expect(box.disabled).toBe(false);
    fireEvent.click(box);
    expect(useAppStore.getState().passModal).toBe("set");
    expect(spy).not.toHaveBeenCalledWith({ encryptData: true });
  });

  // Task 10.5: gpg missing means the switch is off-limits with the plan's
  // tooltip, not a save that fails on the first encrypt.
  it("Encrypt is disabled with the gnupg tooltip when gpg is missing", async () => {
    mockIPC((cmd) => (cmd === "crypto_info" ? { available: false } : null));
    useAppStore.getState().hydrate(emptyReport({ settings: DEFAULT_SETTINGS }));
    render(<PreferencesModal />);
    const box = await screen.findByTestId("prefs-encrypt");
    expect((box as HTMLInputElement).disabled).toBe(true);
    expect(box.getAttribute("title")).toBe("Install gnupg to enable encryption");
  });

  // Turning encryption off must re-ask for the current passphrase.
  it("unticking Encrypt opens the confirm-current-passphrase modal", () => {
    useAppStore.getState().hydrate(emptyReport({ settings: { ...DEFAULT_SETTINGS, encryptData: true } }));
    render(<PreferencesModal />);
    fireEvent.click(screen.getByTestId("prefs-encrypt"));
    expect(useAppStore.getState().passModal).toBe("disable");
    expect(useAppStore.getState().settings.encryptData).toBe(true);
  });

  // Stage 9 un-disabled "Sync SSH config": it asks before rewriting the file.
  it("Sync asks for confirmation, then enables; Cancel enables nothing", async () => {
    const spy = watchUpdates();
    render(
      <>
        <PreferencesModal />
        <ModalHost />
      </>,
    );
    fireEvent.click(screen.getByTestId("prefs-sync-config"));
    const message = await screen.findByTestId("confirm-message");
    expect(message.textContent).toContain("/tmp/fastssh-mock/ssh/config");
    expect(message.textContent).toContain("config.backup");
    expect(message.textContent).toMatch(/Wildcard and Match blocks are kept/);

    fireEvent.click(screen.getByTestId("confirm-cancel"));
    await waitFor(() => expect(screen.queryByTestId("confirm-dialog")).toBeNull());
    expect(spy).not.toHaveBeenCalledWith({ syncSshConfig: true });
    expect((screen.getByTestId("prefs-sync-config") as HTMLInputElement).checked).toBe(false);

    fireEvent.click(screen.getByTestId("prefs-sync-config"));
    await screen.findByTestId("confirm-message");
    fireEvent.click(screen.getByTestId("confirm-ok"));
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ syncSshConfig: true }));
    expect((screen.getByTestId("prefs-sync-config") as HTMLInputElement).checked).toBe(true);
  });

  it("a failed enable leaves the switch off and toasts the error", async () => {
    const spy = watchUpdates();
    const backend = installIpcMock();
    backend.failNext("enable_ssh_config_sync", "ssh/config: Permission denied (os error 13)");
    render(
      <>
        <PreferencesModal />
        <ModalHost />
      </>,
    );
    fireEvent.click(screen.getByTestId("prefs-sync-config"));
    await screen.findByTestId("confirm-message");
    fireEvent.click(screen.getByTestId("confirm-ok"));
    await waitFor(() => expect(useAppStore.getState().toasts.length).toBeGreaterThan(0));
    expect(useAppStore.getState().toasts[0]?.message).toContain("Permission denied");
    expect(useAppStore.getState().toasts[0]?.kind).toBe("error");
    expect(spy).not.toHaveBeenCalledWith({ syncSshConfig: true });
    expect((screen.getByTestId("prefs-sync-config") as HTMLInputElement).checked).toBe(false);
  });

  it("Close closes the modal, and there is no OK/Apply button", () => {
    render(<PreferencesModal />);
    expect(screen.queryByTestId("prefs-apply")).toBeNull();
    fireEvent.click(screen.getByTestId("prefs-close"));
    expect(useAppStore.getState().preferencesOpen).toBe(false);
  });

  it("Escape closes it", () => {
    render(<PreferencesModal />);
    fireEvent.keyDown(screen.getByTestId("preferences-modal"), { key: "Escape" });
    expect(useAppStore.getState().preferencesOpen).toBe(false);
  });
});

describe("hosts folder change (task 8.3)", () => {
  function backend(report: LoadReport) {
    mockIPC((cmd, args) => {
      if (cmd === "folder_has_library") return (args as { path: string }).path === NEW_FOLDER;
      if (cmd === "set_hosts_folder") return report;
      return null;
    });
  }

  it("a folder with a library is loaded, and the field keeps the new path", async () => {
    backend(emptyReport({ hosts: [], settings: { ...DEFAULT_SETTINGS, hostsFolder: NEW_FOLDER } }));
    render(<PreferencesModal />);
    useAppStore.setState({ confirm: async () => true });

    const field = screen.getByTestId("prefs-hosts-folder") as HTMLInputElement;
    fireEvent.change(field, { target: { value: NEW_FOLDER } });
    fireEvent.blur(field);
    await vi.waitFor(() => expect(useAppStore.getState().settings.hostsFolder).toBe(NEW_FOLDER));

    expect(field.value).toBe(NEW_FOLDER);
  });

  it("Cancel puts the old path back and saves nothing", async () => {
    backend(emptyReport({ settings: { ...DEFAULT_SETTINGS, hostsFolder: NEW_FOLDER } }));
    render(<PreferencesModal />);
    const confirm = vi.fn(async () => false);
    useAppStore.setState({ confirm });

    const field = screen.getByTestId("prefs-hosts-folder") as HTMLInputElement;
    fireEvent.change(field, { target: { value: NEW_FOLDER } });
    fireEvent.blur(field);
    await vi.waitFor(() => expect(confirm).toHaveBeenCalled());
    await vi.waitFor(() => expect(field.value).toBe(DEFAULT_SETTINGS.hostsFolder));

    expect(useAppStore.getState().settings.hostsFolder).toBe(DEFAULT_SETTINGS.hostsFolder);
  });

  it("a failed command shows the error and reverts the field", async () => {
    mockIPC((cmd) => {
      if (cmd === "folder_has_library") return true;
      if (cmd === "set_hosts_folder") return Promise.reject({ code: "no_library", message: "no hosts.json there" });
      return null;
    });
    render(<PreferencesModal />);
    useAppStore.setState({ confirm: async () => true });

    const field = screen.getByTestId("prefs-hosts-folder") as HTMLInputElement;
    fireEvent.change(field, { target: { value: NEW_FOLDER } });
    fireEvent.blur(field);
    await vi.waitFor(() => expect(useAppStore.getState().toasts.length).toBeGreaterThan(0));

    expect(useAppStore.getState().toasts[0]?.kind).toBe("error");
    expect(useAppStore.getState().toasts[0]?.message).toContain("no hosts.json there");
    expect(field.value).toBe(DEFAULT_SETTINGS.hostsFolder);
  });
});
