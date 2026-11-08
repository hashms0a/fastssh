import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelUnlock,
  disableEncryption,
  enableEncryption,
  startEmptyLibrary,
  unlockLibrary,
  type EncryptDeps,
  type UnlockDeps,
} from "./cryptoActions";
import { emptyReport } from "../test/ipcMock";
import { strings } from "./strings";

/**
 * Task 10.4 / acceptance: the passphrase flows, with every dependency stubbed.
 * The AppError shape a Rust command rejects with is what `errorCode` reads.
 */
const appError = (code: string, message: string) => ({ code, message });

function unlockDeps(overrides: Partial<UnlockDeps> = {}) {
  const hydrate = vi.fn();
  const confirm = vi.fn(async () => true);
  const quit = vi.fn(async () => undefined);
  const unlock = vi.fn(async () => emptyReport({ locked: false, hosts: [] }));
  const startEmpty = vi.fn(async () => emptyReport({ locked: false }));
  const log = vi.fn();
  const base = { unlock, startEmpty, hydrate, confirm, quit, log };
  const merged = { ...base, ...overrides } as unknown as UnlockDeps;
  return { deps: merged, ...merged };
}

function encryptDeps(overrides: Partial<EncryptDeps> = {}) {
  const setEncryption = vi.fn(async () => undefined);
  const setFlag = vi.fn();
  const flush = vi.fn(async () => undefined);
  const toast = vi.fn();
  const log = vi.fn();
  const base = { setEncryption, setFlag, flush, toast, log };
  const merged = { ...base, ...overrides } as unknown as EncryptDeps;
  return { deps: merged, ...merged };
}

beforeEach(() => vi.restoreAllMocks());

describe("unlockLibrary", () => {
  it("hydrates the report and reports the unlock", async () => {
    const d = unlockDeps();
    const result = await unlockLibrary(d.deps, "test-passphrase-1");
    expect(result.outcome).toBe("unlocked");
    expect(d.unlock).toHaveBeenCalledWith("test-passphrase-1");
    expect(d.hydrate).toHaveBeenCalledTimes(1);
  });

  it("a wrong passphrase reports wrong, and the message is the modal's own text", async () => {
    const d = unlockDeps({
      unlock: vi.fn(async () => {
        throw appError("wrong_passphrase", "Wrong passphrase.");
      }),
    });
    const result = await unlockLibrary(d.deps, "nope-nope-nope");
    expect(result.outcome).toBe("wrong");
    expect(result.message).toBe(strings.gpgWrongPassphrase);
    expect(d.hydrate).not.toHaveBeenCalled();
    expect(d.log).not.toHaveBeenCalled();
  });

  it("an unreadable file fails with its own message, so Start empty can appear", async () => {
    const d = unlockDeps({
      unlock: vi.fn(async () => {
        throw appError("gpg", "/x/hosts.json.gpg: gpg: no valid OpenPGP data found.");
      }),
    });
    const result = await unlockLibrary(d.deps, "whatever");
    expect(result.outcome).toBe("failed");
    expect(result.message).toContain("hosts.json.gpg");
    expect(result.message).toContain("OpenPGP");
    expect(d.hydrate).not.toHaveBeenCalled();
    expect(d.log).toHaveBeenCalled();
  });

  it("an empty passphrase is not sent to Rust at all", async () => {
    const d = unlockDeps();
    expect((await unlockLibrary(d.deps, "")).outcome).toBe("cancelled");
    expect(d.unlock).not.toHaveBeenCalled();
  });
});

describe("cancelUnlock (acceptance: Cancel at unlock asks 'Quit FastSSH?' then calls quit_app)", () => {
  it("asks first, and quits only on OK", async () => {
    const d = unlockDeps();
    expect((await cancelUnlock(d.deps)).outcome).toBe("quit");
    expect(d.confirm).toHaveBeenCalledWith(strings.gpgQuitTitle, strings.gpgQuitMessage);
    expect(d.quit).toHaveBeenCalledTimes(1);
  });

  it("Cancel on the question leaves the app running", async () => {
    const d = unlockDeps({ confirm: vi.fn(async () => false) });
    expect((await cancelUnlock(d.deps)).outcome).toBe("cancelled");
    expect(d.quit).not.toHaveBeenCalled();
  });

  it("a failed quit is logged, not thrown", async () => {
    const d = unlockDeps({
      quit: vi.fn(async () => {
        throw appError("io", "quit failed");
      }),
    });
    expect((await cancelUnlock(d.deps)).outcome).toBe("cancelled");
    expect(d.log).toHaveBeenCalled();
  });
});

describe("startEmptyLibrary", () => {
  it("asks, then renames aside and hydrates the empty library", async () => {
    const d = unlockDeps();
    expect((await startEmptyLibrary(d.deps)).outcome).toBe("emptied");
    expect(d.confirm).toHaveBeenCalledWith(strings.gpgStartEmptyTitle, strings.gpgStartEmptyMessage);
    expect(d.startEmpty).toHaveBeenCalledTimes(1);
    expect(d.hydrate).toHaveBeenCalledTimes(1);
  });

  it("a declined question touches nothing", async () => {
    const d = unlockDeps({ confirm: vi.fn(async () => false) });
    expect((await startEmptyLibrary(d.deps)).outcome).toBe("cancelled");
    expect(d.startEmpty).not.toHaveBeenCalled();
    expect(d.hydrate).not.toHaveBeenCalled();
  });

  it("a failed rename stays in the modal with the error", async () => {
    const d = unlockDeps({
      startEmpty: vi.fn(async () => {
        throw appError("io", "/x/hosts.json.gpg: Permission denied");
      }),
    });
    const result = await startEmptyLibrary(d.deps);
    expect(result.outcome).toBe("failed");
    expect(result.message).toContain("Permission denied");
    expect(d.hydrate).not.toHaveBeenCalled();
  });
});

describe("enableEncryption (task 10.3)", () => {
  it("sends the passphrase, sets the flag, flushes settings and toasts", async () => {
    const d = encryptDeps();
    const result = await enableEncryption(d.deps, "test-passphrase-1", "test-passphrase-1");
    expect(result.outcome).toBe("on");
    expect(d.setEncryption).toHaveBeenCalledWith(true, "test-passphrase-1");
    expect(d.setFlag).toHaveBeenCalledWith(true);
    expect(d.flush).toHaveBeenCalledTimes(1);
    expect(d.toast).toHaveBeenCalledWith(strings.libraryEncrypted);
  });

  it("a short or mismatched passphrase never reaches Rust", async () => {
    const d = encryptDeps();
    expect((await enableEncryption(d.deps, "abc", "abc")).outcome).toBe("invalid");
    expect((await enableEncryption(d.deps, "test-passphrase-1", "other")).outcome).toBe("invalid");
    expect(d.setEncryption).not.toHaveBeenCalled();
    expect(d.setFlag).not.toHaveBeenCalled();
  });

  it("a failed enable leaves the flag off and toasts the error", async () => {
    const d = encryptDeps({
      setEncryption: vi.fn(async () => {
        throw appError("verify", "hosts.json.gpg could not be decrypted again");
      }),
    });
    const result = await enableEncryption(d.deps, "test-passphrase-1", "test-passphrase-1");
    expect(result.outcome).toBe("failed");
    expect(d.setFlag).not.toHaveBeenCalled();
    expect(d.toast).toHaveBeenCalledWith(expect.stringContaining("could not be decrypted"), "error");
  });
});

describe("disableEncryption", () => {
  it("needs the current passphrase and clears the flag on success", async () => {
    const d = encryptDeps();
    const result = await disableEncryption(d.deps, "test-passphrase-1");
    expect(result.outcome).toBe("off");
    expect(d.setEncryption).toHaveBeenCalledWith(false, "test-passphrase-1");
    expect(d.setFlag).toHaveBeenCalledWith(false);
    expect(d.toast).toHaveBeenCalledWith(strings.libraryDecrypted);
  });

  it("a wrong passphrase reports wrong and keeps the flag on", async () => {
    const d = encryptDeps({
      setEncryption: vi.fn(async () => {
        throw appError("wrong_passphrase", "Wrong passphrase.");
      }),
    });
    const result = await disableEncryption(d.deps, "wrong-passphrase");
    expect(result.outcome).toBe("wrong");
    expect(result.message).toContain("Wrong passphrase");
    expect(d.setFlag).not.toHaveBeenCalled();
  });
});
