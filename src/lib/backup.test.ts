import { beforeEach, describe, expect, it } from "vitest";
import { backupLibrary, resetBackupGuard } from "./backup";
import type { ExportReport } from "./ipc";

const report = (over: Partial<ExportReport> = {}): ExportReport => ({
  path: "/home/me/fastssh/backups/fastssh-library-20261108-140731.json",
  encrypted: false,
  hosts: 5,
  accounts: 1,
  bookmarks: 2,
  ...over,
});

function deps(run: (path: string | null) => Promise<ExportReport>) {
  const toasts: Array<[string, string | undefined]> = [];
  const logs: Array<[string, unknown]> = [];
  return {
    run,
    toast: (message: string, kind?: "info" | "error") => toasts.push([message, kind]),
    log: (message: string, error: unknown) => logs.push([message, error]),
    toasts,
    logs,
  };
}

beforeEach(() => resetBackupGuard());

describe("backupLibrary (Stage 11, P2)", () => {
  it("passes null for the automatic backups folder", async () => {
    const seen: Array<string | null> = [];
    const d = deps(async (p) => {
      seen.push(p);
      return report();
    });
    const out = await backupLibrary(d, null);
    expect(seen).toEqual([null]);
    expect(out?.hosts).toBe(5);
    expect(d.toasts[0]?.[0]).toContain("fastssh-library-20261108-140731.json");
    expect(d.toasts[0]?.[0]).toContain("Backed up 5 connections, 1 account, 2 bookmarks");
  });

  it("passes the path the dialog picked", async () => {
    const d = deps(async () => report());
    await backupLibrary(d, "/mnt/usb/lib.json");
    expect(d.logs).toEqual([]);
    expect(d.toasts).toHaveLength(1);
  });

  it("says when the copy is encrypted", async () => {
    const d = deps(async () => report({ encrypted: true }));
    await backupLibrary(d, null);
    expect(d.toasts[0]?.[0]).toContain("(encrypted)");
  });

  it("names a single record in the singular", async () => {
    const d = deps(async () => report({ hosts: 1, accounts: 1, bookmarks: 1 }));
    await backupLibrary(d, null);
    expect(d.toasts[0]?.[0]).toContain("Backed up 1 connection, 1 account, 1 bookmark");
    expect(d.toasts[0]?.[0]).not.toContain("connections");
  });

  it("toasts the failure and logs it", async () => {
    const d = deps(() => Promise.reject({ code: "exists", message: "/x/mine.json already exists" }));
    const out = await backupLibrary(d, "/x/mine.json");
    expect(out).toBeNull();
    expect(d.toasts[0]).toEqual(["/x/mine.json already exists", "error"]);
    expect(d.logs[0]?.[0]).toBe("export_library failed");
  });

  it("a second click while one is running does nothing", async () => {
    let release: () => void = () => undefined;
    let calls = 0;
    const d = deps(async () => {
      calls += 1;
      if (calls === 1) await new Promise<void>((resolve) => (release = resolve));
      return report();
    });
    const first = backupLibrary(d, null);
    expect(await backupLibrary(d, null)).toBeNull(); // blocked, nothing ran
    expect(calls).toBe(1);
    release();
    expect(await first).not.toBeNull();
    expect(await backupLibrary(d, null)).not.toBeNull(); // the guard is released
  });
});
