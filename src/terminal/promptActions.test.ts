import { beforeEach, describe, expect, it, vi } from "vitest";
import { callsTo, installIpcMock, type MockBackend } from "../test/ipcMock";
import { strings } from "../lib/strings";
import { useAppStore } from "../store/useAppStore";
import { clearRemotes, writeTab } from "./promptActions";

/**
 * Task 12.1: a write that fails means the keystrokes vanish. The user must
 * hear about it, but only once per tab, so a dead session cannot toast on
 * every character.
 */
let backend: MockBackend;

beforeEach(() => {
  backend = installIpcMock();
  clearRemotes();
  useAppStore.setState({ toasts: [] });
});

describe("writeTab failure reporting (task 12.1)", () => {
  it("a failed write raises one error toast", async () => {
    backend.failNext("write_pty", "no session s1");
    writeTab("t1", "s1", "ls\n");
    await vi.waitFor(() => expect(useAppStore.getState().toasts).toHaveLength(1));
    expect(useAppStore.getState().toasts[0]).toMatchObject({
      kind: "error",
      message: strings.keystrokesFailed,
    });
  });

  it("a second failure on the same tab stays quiet", async () => {
    backend.failNext("write_pty", "no session s1");
    writeTab("t1", "s1", "l");
    await vi.waitFor(() => expect(useAppStore.getState().toasts).toHaveLength(1));
    backend.failNext("write_pty", "no session s1");
    writeTab("t1", "s1", "s");
    await vi.waitFor(() => expect(callsTo(backend, "write_pty")).toHaveLength(2));
    expect(useAppStore.getState().toasts).toHaveLength(1);
  });

  it("forgetting the tab re-arms the report", async () => {
    backend.failNext("write_pty", "no session s1");
    writeTab("t1", "s1", "l");
    await vi.waitFor(() => expect(useAppStore.getState().toasts).toHaveLength(1));
    clearRemotes();
    backend.failNext("write_pty", "no session s1");
    writeTab("t1", "s1", "l");
    await vi.waitFor(() => expect(useAppStore.getState().toasts).toHaveLength(2));
  });
});
