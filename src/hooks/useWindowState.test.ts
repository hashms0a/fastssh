import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWindowState } from "./useWindowState";

const { updateSettings, win } = vi.hoisted(() => {
  const updateSettings = vi.fn();
  const win = {
    innerSize: vi.fn(),
    scaleFactor: vi.fn(),
    isMaximized: vi.fn(),
    isFullscreen: vi.fn(),
    onResized: vi.fn(),
    onMoved: vi.fn(),
  };
  return { updateSettings, win };
});

vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => win }));
vi.mock("../store/useAppStore", () => ({
  useAppStore: (select: (s: { updateSettings: typeof updateSettings }) => unknown) => select({ updateSettings }),
}));

/** The hook subscribes through onResized; call that callback like a resize would. */
function fireResize(): void {
  const cb = win.onResized.mock.calls[0]?.[0] as (() => void) | undefined;
  expect(cb).toBeTruthy();
  act(() => cb?.());
}

async function settle(ms = 2000): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

beforeEach(() => {
  vi.useFakeTimers();
  updateSettings.mockClear();
  win.onResized.mockImplementation(async (cb: () => void) => {
    void cb;
    return () => {};
  });
  win.onMoved.mockImplementation(async () => () => {});
  win.scaleFactor.mockResolvedValue(1);
  win.isMaximized.mockResolvedValue(false);
  win.isFullscreen.mockResolvedValue(false);
  win.innerSize.mockResolvedValue({ width: 1100, height: 640 });
});

describe("useWindowState (R19a)", () => {
  it("adopts the boot size without writing it", async () => {
    renderHook(() => useWindowState());
    await settle();
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it("saves a new size when it is not fullscreen", async () => {
    renderHook(() => useWindowState());
    await settle();
    win.innerSize.mockResolvedValue({ width: 900, height: 600 });
    fireResize();
    await settle();
    expect(updateSettings).toHaveBeenCalledWith({ windowMaximized: false, windowWidth: 900, windowHeight: 600 });
  });

  it("ignores sizes while fullscreen so the restore size survives", async () => {
    renderHook(() => useWindowState());
    await settle();
    win.isFullscreen.mockResolvedValue(true);
    win.innerSize.mockResolvedValue({ width: 1920, height: 1080 });
    fireResize();
    await settle();
    expect(updateSettings).not.toHaveBeenCalled();

    // Leaving fullscreen with the windowed size back: that is saved again.
    win.isFullscreen.mockResolvedValue(false);
    win.innerSize.mockResolvedValue({ width: 900, height: 600 });
    fireResize();
    await settle();
    expect(updateSettings).toHaveBeenCalledWith({ windowMaximized: false, windowWidth: 900, windowHeight: 600 });
  });

  it("writes only the maximized flag while maximized (no screen size)", async () => {
    renderHook(() => useWindowState());
    await settle();
    win.isMaximized.mockResolvedValue(true);
    win.innerSize.mockResolvedValue({ width: 1920, height: 1080 });
    fireResize();
    await settle();
    expect(updateSettings).toHaveBeenCalledWith({ windowMaximized: true });
  });
});
