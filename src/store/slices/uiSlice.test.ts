import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../useAppStore";
import { LOCALHOST_ID } from "../../types/models";
import { installIpcMock } from "../../test/ipcMock";

beforeEach(() => {
  installIpcMock();
  useAppStore.setState({ toasts: [] });
});

describe("uiSlice", () => {
  it("Localhost is selected by default (landing card on the first frame)", () => {
    expect(useAppStore.getState().selectedHostId).toBe(LOCALHOST_ID);
  });

  it("info toasts auto-dismiss after 6 s; error toasts stay", () => {
    vi.useFakeTimers();
    useAppStore.getState().pushToast("saved");
    useAppStore.getState().pushToast("disk full", "error");
    expect(useAppStore.getState().toasts).toHaveLength(2);
    vi.advanceTimersByTime(5999);
    expect(useAppStore.getState().toasts).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(useAppStore.getState().toasts.map((t) => t.kind)).toEqual(["error"]);
    vi.useRealTimers();
  });

  it("dismissToast removes exactly one toast", () => {
    useAppStore.getState().pushToast("a");
    useAppStore.getState().pushToast("b");
    const toasts = useAppStore.getState().toasts;
    useAppStore.getState().dismissToast(toasts[0]!.id);
    expect(useAppStore.getState().toasts.map((t) => t.message)).toEqual(["b"]);
  });

  it("setSidebarMode / selectHost / selectAccount / setFilter set state", () => {
    const s = useAppStore.getState();
    s.setSidebarMode("accounts");
    s.selectHost("h9");
    s.selectAccount("a9");
    s.setFilter("web");
    const n = useAppStore.getState();
    expect([n.sidebarMode, n.selectedHostId, n.selectedAccountId, n.filter]).toEqual(["accounts", "h9", "a9", "web"]);
  });
});
