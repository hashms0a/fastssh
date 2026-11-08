import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import { PreferencesModal } from "./PreferencesModal";
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

  it("General: Restore toggles, and Sync/Encrypt are disabled for now", () => {
    const spy = watchUpdates();
    render(<PreferencesModal />);
    fireEvent.click(screen.getByTestId("prefs-restore-hosts"));
    expect(spy).toHaveBeenCalledWith({ restoreHosts: true });
    expect((screen.getByTestId("prefs-sync-config") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByTestId("prefs-encrypt") as HTMLInputElement).disabled).toBe(true);
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
