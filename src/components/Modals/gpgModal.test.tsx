import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { GpgPasswordModal } from "./GpgPasswordModal";
import { ModalHost } from "./ModalHost";
import { useAppStore } from "../../store/useAppStore";
import { emptyReport } from "../../test/ipcMock";
import { DEFAULT_SETTINGS } from "../../types/models";
import { strings } from "../../lib/strings";

/**
 * Task 10.4: the passphrase modal driven through the store. `ipc` is mocked,
 * so each test proves what the modal does with the answer it got: keep the
 * input on a wrong passphrase, offer "Start empty" on an unreadable file, ask
 * "Quit FastSSH?" on Cancel, and flip the Encrypt flag only after Rust agreed.
 */
const ipc = vi.hoisted(() => ({
  unlockLibrary: vi.fn(async () => emptyReport({ locked: false })),
  startEmptyLibrary: vi.fn(async () => emptyReport({ locked: false })),
  setEncryption: vi.fn(async () => undefined),
  quit: vi.fn(async () => undefined),
  loadAll: vi.fn(async () => emptyReport({ locked: false })),
  saveSettings: vi.fn(async () => undefined),
}));

vi.mock("../../lib/ipc", () => ({ ipc }));

const type = (testId: string, value: string) => fireEvent.change(screen.getByTestId(testId), { target: { value } });

/** The confirm dialog a flow raises, answered with `ok`. */
async function answerConfirm(ok: boolean): Promise<void> {
  await screen.findByTestId("confirm-dialog");
  fireEvent.click(screen.getByTestId(ok ? "confirm-ok" : "confirm-cancel"));
}

beforeEach(() => {
  ipc.unlockLibrary.mockClear();
  ipc.startEmptyLibrary.mockClear();
  ipc.setEncryption.mockClear();
  ipc.quit.mockClear();
  ipc.saveSettings.mockClear();
  useAppStore.setState({
    modals: [],
    dialogs: [],
    toasts: [],
    passModal: null,
    locked: true,
    preferencesOpen: false,
    // Each test starts from the plain settings, so a flag set by an earlier
    // test cannot make a later assertion pass or fail by accident.
    settings: DEFAULT_SETTINGS,
  });
});

describe("unlock mode", () => {
  it("the right passphrase hydrates the library and clears `locked`", async () => {
    useAppStore.getState().hydrate(emptyReport({ locked: true }));
    ipc.unlockLibrary.mockResolvedValueOnce(emptyReport({ locked: false, hosts: [] }));
    render(<GpgPasswordModal mode="unlock" />);
    expect(screen.getByTestId("gpg-title").textContent).toBe(strings.gpgUnlockTitle);

    type("gpg-pass", "test-passphrase-1");
    fireEvent.click(screen.getByTestId("gpg-submit"));
    await vi.waitFor(() => expect(useAppStore.getState().locked).toBe(false));
    expect(ipc.unlockLibrary).toHaveBeenCalledWith("test-passphrase-1");
  });

  it("a wrong passphrase says so and keeps the text in the field", async () => {
    render(<GpgPasswordModal mode="unlock" />);
    ipc.unlockLibrary.mockRejectedValueOnce({ code: "wrong_passphrase", message: "Wrong passphrase." });
    type("gpg-pass", "typo-but-long-enough");
    fireEvent.click(screen.getByTestId("gpg-submit"));
    await vi.waitFor(() => expect(screen.queryByTestId("gpg-error")).not.toBeNull());
    expect(screen.getByTestId("gpg-error").textContent).toBe(strings.gpgWrongPassphrase);
    expect((screen.getByTestId("gpg-pass") as HTMLInputElement).value).toBe("typo-but-long-enough");
    expect(screen.getByTestId("gpg-modal")).toBeTruthy();
    expect(screen.queryByTestId("gpg-start-empty")).toBeNull();
    expect(useAppStore.getState().locked).toBe(true);
  });

  it("an unreadable file shows its error and offers Start empty", async () => {
    ipc.unlockLibrary.mockRejectedValueOnce({
      code: "gpg",
      message: "/x/hosts.json.gpg: gpg: no valid OpenPGP data found.",
    });
    render(
      <>
        <GpgPasswordModal mode="unlock" />
        <ModalHost />
      </>,
    );
    type("gpg-pass", "anything-at-all");
    fireEvent.click(screen.getByTestId("gpg-submit"));

    await vi.waitFor(() => expect(screen.getByTestId("gpg-error").textContent).toContain("no valid OpenPGP data"));
    fireEvent.click(screen.getByTestId("gpg-start-empty"));
    await screen.findByTestId("confirm-dialog");
    fireEvent.click(screen.getByTestId("confirm-ok"));
    await vi.waitFor(() => expect(ipc.startEmptyLibrary).toHaveBeenCalledTimes(1));
    expect(useAppStore.getState().locked).toBe(false);
  });

  // Acceptance [unit]: Cancel at unlock asks "Quit FastSSH?" and then quits.
  it("Cancel asks 'Quit FastSSH?' and then calls quit_app", async () => {
    render(
      <>
        <GpgPasswordModal mode="unlock" />
        <ModalHost />
      </>,
    );
    fireEvent.click(screen.getByTestId("gpg-cancel"));
    const title = await screen.findByTestId("confirm-title");
    expect(title.textContent).toBe(strings.gpgQuitTitle);
    expect(ipc.quit).not.toHaveBeenCalled();
    await answerConfirm(true);
    await vi.waitFor(() => expect(ipc.quit).toHaveBeenCalledTimes(1));
  });

  it("Cancel on that question leaves the app running", async () => {
    render(
      <>
        <GpgPasswordModal mode="unlock" />
        <ModalHost />
      </>,
    );
    fireEvent.click(screen.getByTestId("gpg-cancel"));
    await answerConfirm(false);
    expect(ipc.quit).not.toHaveBeenCalled();
    expect(useAppStore.getState().locked).toBe(true);
  });

  it("Enter in the field submits, and the passphrase is never stored", async () => {
    render(<GpgPasswordModal mode="unlock" />);
    type("gpg-pass", "test-passphrase-1");
    fireEvent.keyDown(screen.getByTestId("gpg-pass"), { key: "Enter" });
    await vi.waitFor(() => expect(ipc.unlockLibrary).toHaveBeenCalledWith("test-passphrase-1"));
    const stored = JSON.stringify(useAppStore.getState());
    expect(stored).not.toContain("test-passphrase-1");
  });
});

describe("set mode (Preferences -> Encrypt)", () => {
  beforeEach(() => useAppStore.setState({ locked: false, passModal: "set" }));

  it("two matching passphrases encrypt, set the flag and close the modal", async () => {
    render(<GpgPasswordModal mode="set" />);
    expect(screen.getByTestId("gpg-pass-again")).toBeTruthy();
    type("gpg-pass", "test-passphrase-1");
    type("gpg-pass-again", "test-passphrase-1");
    fireEvent.click(screen.getByTestId("gpg-submit"));
    await vi.waitFor(() => expect(ipc.setEncryption).toHaveBeenCalledWith(true, "test-passphrase-1"));
    // The flag and the modal close happen after the IPC call resolves.
    await vi.waitFor(() => expect(useAppStore.getState().passModal).toBeNull());
    expect(useAppStore.getState().settings.encryptData).toBe(true);
    expect((screen.getByTestId("gpg-pass") as HTMLInputElement).value).toBe("");
    expect(useAppStore.getState().toasts.map((t) => t.message)).toContain(strings.libraryEncrypted);
  });

  it("a mismatch is shown in the modal and never sent to Rust", async () => {
    render(<GpgPasswordModal mode="set" />);
    type("gpg-pass", "test-passphrase-1");
    type("gpg-pass-again", "test-passphrase-2");
    fireEvent.click(screen.getByTestId("gpg-submit"));
    await vi.waitFor(() => expect(screen.getByTestId("gpg-error").textContent).toBe(strings.gpgPassMismatch));
    expect(ipc.setEncryption).not.toHaveBeenCalled();
    expect(useAppStore.getState().settings.encryptData).toBe(false);
  });

  it("a failed enable keeps the flag off and toasts the error", async () => {
    ipc.setEncryption.mockRejectedValueOnce({ code: "gpg", message: "gpg is not installed" });
    render(
      <>
        <GpgPasswordModal mode="set" />
        <ModalHost />
      </>,
    );
    type("gpg-pass", "test-passphrase-1");
    type("gpg-pass-again", "test-passphrase-1");
    fireEvent.click(screen.getByTestId("gpg-submit"));
    await vi.waitFor(() => expect(useAppStore.getState().toasts.length).toBe(1));
    expect(useAppStore.getState().settings.encryptData).toBe(false);
    expect(useAppStore.getState().passModal).toBe("set");
    expect(screen.getByTestId("gpg-modal")).toBeTruthy();
  });
});

describe("disable mode (Preferences unticks Encrypt)", () => {
  beforeEach(() => {
    useAppStore.setState({ locked: false, passModal: "disable" });
    useAppStore
      .getState()
      .hydrate(emptyReport({ settings: { ...useAppStore.getState().settings, encryptData: true } }));
  });

  it("the current passphrase decrypts and clears the flag", async () => {
    render(<GpgPasswordModal mode="disable" />);
    expect(screen.queryByTestId("gpg-pass-again")).toBeNull();
    type("gpg-pass", "test-passphrase-1");
    fireEvent.click(screen.getByTestId("gpg-submit"));
    await vi.waitFor(() => expect(ipc.setEncryption).toHaveBeenCalledWith(false, "test-passphrase-1"));
    await vi.waitFor(() => expect(useAppStore.getState().passModal).toBeNull());
    expect(useAppStore.getState().settings.encryptData).toBe(false);
  });

  it("a wrong passphrase keeps encryption on and the modal open", async () => {
    ipc.setEncryption.mockRejectedValueOnce({ code: "wrong_passphrase", message: "Wrong passphrase." });
    render(<GpgPasswordModal mode="disable" />);
    type("gpg-pass", "not-the-passphrase");
    fireEvent.click(screen.getByTestId("gpg-submit"));
    await vi.waitFor(() => expect(screen.getByTestId("gpg-error").textContent).toBe(strings.gpgWrongPassphrase));
    expect(useAppStore.getState().settings.encryptData).toBe(true);
    expect(useAppStore.getState().passModal).toBe("disable");
  });

  it("Cancel closes the modal without quitting", async () => {
    render(
      <>
        <GpgPasswordModal mode="disable" />
        <ModalHost />
      </>,
    );
    fireEvent.click(screen.getByTestId("gpg-cancel"));
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
    expect(useAppStore.getState().passModal).toBeNull();
    expect(ipc.quit).not.toHaveBeenCalled();
  });
});
