import { beforeEach, describe, expect, it, vi } from "vitest";
import { runEasysshImport, type ImportDeps } from "./easysshImport";
import { strings } from "./strings";

/**
 * Task 10.7: the one-click import reports the counts, reloads the library so
 * the new rows appear, logs every warning and toasts the first three.
 */
function deps(overrides: Partial<ImportDeps> = {}) {
  const importEasyssh = vi.fn(async () => ({
    hostsAdded: 5,
    accountsAdded: 1,
    bookmarksAdded: 2,
    skipped: [],
    warnings: [],
  }));
  const reload = vi.fn(async () => undefined);
  const toast = vi.fn();
  const log = vi.fn();
  const base = { importEasyssh, reload, toast, log };
  const merged = { ...base, ...overrides } as unknown as ImportDeps;
  return { deps: merged, ...merged };
}

beforeEach(() => vi.restoreAllMocks());

describe("runEasysshImport", () => {
  it("toasts 5 / 1 / 2 and reloads the library", async () => {
    const d = deps();
    expect(await runEasysshImport(d.deps)).toBe("imported");
    expect(d.toast).toHaveBeenCalledWith("Imported 5 connections, 1 account, 2 bookmarks");
    expect(d.reload).toHaveBeenCalledTimes(1);
  });

  it("names the skipped records and uses singular forms", async () => {
    const d = deps({
      importEasyssh: vi.fn(async () => ({
        hostsAdded: 0,
        accountsAdded: 1,
        bookmarksAdded: 0,
        skipped: ["item10"],
        warnings: [],
      })),
    });
    await runEasysshImport(d.deps);
    expect(d.toast).toHaveBeenCalledWith("Imported 0 connections, 1 account, 0 bookmarks (1 skipped)");
  });

  it("logs every warning and toasts only the first three", async () => {
    const warnings = ["a", "b", "c", "d", "e"];
    const d = deps({
      importEasyssh: vi.fn(async () => ({
        hostsAdded: 5,
        accountsAdded: 1,
        bookmarksAdded: 2,
        skipped: [],
        warnings,
      })),
    });
    await runEasysshImport(d.deps);
    expect(d.log).toHaveBeenCalledTimes(5);
    expect(d.toast).toHaveBeenCalledWith(strings.importWarnings(["a", "b", "c"]), "error");
  });

  it("a failed import toasts the error and reloads nothing", async () => {
    const d = deps({
      importEasyssh: vi.fn(async () => {
        throw { code: "io", message: "/x/hosts.json: Permission denied" };
      }),
    });
    expect(await runEasysshImport(d.deps)).toBe("failed");
    expect(d.toast).toHaveBeenCalledWith("/x/hosts.json: Permission denied", "error");
    expect(d.reload).not.toHaveBeenCalled();
  });

  it("a second click while one import runs does not start another", async () => {
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const importEasyssh = vi.fn(() =>
      gate.then(() => ({ hostsAdded: 0, accountsAdded: 0, bookmarksAdded: 0, skipped: [], warnings: [] })),
    );
    const d = deps({ importEasyssh: importEasyssh as unknown as () => Promise<never> });
    const first = runEasysshImport(d.deps);
    const second = await runEasysshImport(d.deps);
    expect(second).toBe("failed");
    release();
    expect(await first).toBe("imported");
    expect(importEasyssh).toHaveBeenCalledTimes(1);
  });
});
