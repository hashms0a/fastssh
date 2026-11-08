import { beforeEach, describe, expect, it } from "vitest";
import { strings } from "./strings";
import { backupNow, backupToPickedFile, lockLibraryNow } from "./backupActions";
import { callsTo, installIpcMock, type MockBackend } from "../test/ipcMock";
import { resetBackupGuard } from "./backup";
import { useAppStore } from "../store/useAppStore";

let backend: MockBackend;

beforeEach(() => {
  backend = installIpcMock();
  resetBackupGuard();
  useAppStore.setState({ locked: false, toasts: [] });
});

describe("header menu library-file actions (Stage 11)", () => {
  it("Back up library calls export_library with no path and toasts the file", async () => {
    await backupNow();
    expect(callsTo(backend, "export_library")).toEqual([{ cmd: "export_library", args: { path: null } }]);
    expect(useAppStore.getState().toasts[0]?.message).toContain("fastssh-library-20261108-140731.json");
    expect(useAppStore.getState().toasts[0]?.kind).toBe("info");
  });

  it("Export library… uses the path the save dialog returned", async () => {
    backend.answer("plugin:dialog|save", "/mnt/usb/library.json");
    await backupToPickedFile();
    expect(callsTo(backend, "export_library")[0]?.args).toEqual({ path: "/mnt/usb/library.json" });
  });

  it("a cancelled dialog exports nothing", async () => {
    backend.answer("plugin:dialog|save", null);
    await backupToPickedFile();
    expect(callsTo(backend, "export_library")).toHaveLength(0);
    expect(useAppStore.getState().toasts).toHaveLength(0);
  });

  it("a failed backup toasts the error", async () => {
    backend.failNext("export_library", { code: "io", message: "/backups: Permission denied (os error 13)" });
    await backupNow();
    expect(useAppStore.getState().toasts[0]).toMatchObject({
      kind: "error",
      message: "/backups: Permission denied (os error 13)",
    });
  });

  it("Lock library drops the passphrase and shows the unlock modal again", async () => {
    await lockLibraryNow();
    expect(callsTo(backend, "lock_library")).toHaveLength(1);
    expect(useAppStore.getState().locked).toBe(true);
  });

  it("a failed lock keeps the library unlocked and toasts the reason", async () => {
    backend.failNext("lock_library", "boom");
    expect(await lockLibraryNow()).toBe(false);
    expect(useAppStore.getState().locked).toBe(false);
    expect(useAppStore.getState().toasts[0]).toMatchObject({
      kind: "error",
      message: strings.lockFailed,
    });
  });
});
