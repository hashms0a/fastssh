import { beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { render } from "@testing-library/react";
import type { Host } from "../types/models";
import { DEFAULT_SETTINGS, LOCALHOST_HOST } from "../types/models";
import { emptyReport, installIpcMock, type MockBackend } from "../test/ipcMock";
import { useAppStore } from "../store/useAppStore";
import { useRestoreTabs } from "./useRestoreTabs";

const mocks = vi.hoisted(() => ({ connect: vi.fn(async (...args: unknown[]) => void args) }));
vi.mock("../terminal/sessionController", () => ({ connectHost: mocks.connect }));

function Probe() {
  useRestoreTabs();
  return null;
}

function host(name: string): Host {
  return { ...LOCALHOST_HOST, id: name, name, host: "10.0.0.1", local: undefined };
}

const settle = async (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

let backend: MockBackend;

beforeEach(async () => {
  backend = installIpcMock();
  // Let a previous test's staggered restore finish before this one counts calls.
  await settle(400);
  mocks.connect.mockClear();
  useAppStore.getState().hydrate(
    emptyReport({
      hosts: [LOCALHOST_HOST, host("item2")],
      settings: {
        ...DEFAULT_SETTINGS,
        restoreHosts: true,
        openedHosts: [
          { hostName: "item2", tabCount: 2 },
          { hostName: "gone", tabCount: 3 },
        ],
      },
    }),
  );
});

describe("useRestoreTabs (task 8.5)", () => {
  it("reopens the saved tabs and skips a host that was deleted", async () => {
    render(<Probe />);
    await settle(700);
    expect(mocks.connect.mock.calls.map((c) => (c[0] as Host).name)).toEqual(["item2", "item2"]);
    expect(useAppStore.getState().settings.openedHosts).toEqual([]);
  });

  it("selects the first restored host", async () => {
    render(<Probe />);
    await settle(700);
    expect(useAppStore.getState().selectedHostId).toBe("item2");
    expect(useAppStore.getState().sidebarMode).toBe("hosts");
  });

  it("flushes the cleared list to disk before the tabs open", async () => {
    render(<Probe />);
    await settle(50);
    const saved = backend.calls.filter((c) => c.cmd === "save_settings");
    expect(saved.length).toBeGreaterThan(0);
    expect((saved[0]!.args as { settings: { openedHosts: unknown } }).settings.openedHosts).toEqual([]);
  });

  it("opens nothing when Restore is off", async () => {
    useAppStore.getState().updateSettings({ restoreHosts: false });
    render(<Probe />);
    await settle(200);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("runs once, so a StrictMode double effect cannot double-restore", async () => {
    render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );
    await settle(700);
    expect(mocks.connect).toHaveBeenCalledTimes(2);
  });
});
