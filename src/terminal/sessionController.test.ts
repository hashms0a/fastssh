import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Host } from "../types/models";
import { DEFAULT_SETTINGS } from "../types/models";

/**
 * Stage 5 acceptance for the wiring in `sessionController`, driven with a
 * mocked event bus and a mocked IPC layer: Retry must swap the session, and
 * output from the killed session must never reach the terminal again.
 */

type Listener = (ev: { payload: unknown }) => void;

const bus = vi.hoisted(() => {
  const handlers = new Map<string, Set<Listener>>();
  return {
    add(name: string, fn: Listener) {
      const set = handlers.get(name) ?? new Set<Listener>();
      set.add(fn);
      handlers.set(name, set);
      return () => {
        handlers.get(name)?.delete(fn);
      };
    },
    emit(name: string, payload: unknown) {
      for (const fn of [...(handlers.get(name) ?? new Set<Listener>())]) fn({ payload });
    },
    count: (name: string) => handlers.get(name)?.size ?? 0,
    clear: () => handlers.clear(),
  };
});

const calls = vi.hoisted(() => ({
  spawn: [] as Array<{ sessionId: string; host: Host; sync: boolean }>,
  write: [] as Array<{ sessionId: string; data: string }>,
  killed: [] as string[],
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (name: string, fn: Listener) => bus.add(name, fn)),
}));

vi.mock("../lib/ipc", () => ({
  ipc: {
    spawnSession: vi.fn(async (sessionId: string, host: Host, sync: boolean) => {
      calls.spawn.push({ sessionId, host, sync });
    }),
    writePty: vi.fn(async (sessionId: string, data: string) => {
      calls.write.push({ sessionId, data });
    }),
    resizePty: vi.fn(async () => undefined),
    killSession: vi.fn(async (sessionId: string) => {
      calls.killed.push(sessionId);
    }),
  },
}));

interface FakeTerm {
  cols: number;
  rows: number;
  writes: string[];
  write(text: string): void;
  reset(): void;
  onData(fn: (data: string) => void): void;
  onResize(_fn: (size: { cols: number; rows: number }) => void): void;
}

const registry = vi.hoisted(() => {
  const entries = new Map<string, { term: FakeTerm; typed: (data: string) => void }>();
  const create = (tabId: string) => {
    const writes: string[] = [];
    let onDataFn: ((data: string) => void) | null = null;
    const term: FakeTerm = {
      cols: 80,
      rows: 24,
      writes,
      write: (text: string) => writes.push(text),
      reset: () => {
        writes.length = 0;
      },
      onData: (fn: (data: string) => void) => {
        onDataFn = fn;
      },
      onResize: () => undefined,
    };
    entries.set(tabId, {
      term,
      typed: (data: string) => onDataFn?.(data),
    });
    return { term, host: document.createElement("div"), opened: true };
  };
  return {
    create: vi.fn(create),
    getEntry: vi.fn((tabId: string) => entries.get(tabId) ?? undefined),
    dispose: vi.fn((tabId: string) => entries.delete(tabId)),
    typed: (tabId: string, data: string) => entries.get(tabId)?.typed(data),
    writes: (tabId: string) => entries.get(tabId)?.term.writes.join("") ?? "",
    reset: () => entries.clear(),
  };
});

vi.mock("./terminalRegistry", () => ({
  createTerminal: registry.create,
  getEntry: registry.getEntry,
  dispose: registry.dispose,
}));

vi.mock("../lib/log", () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
}));

import { ipc } from "../lib/ipc";
import { useAppStore } from "../store/useAppStore";
import { LOCALHOST_HOST, type Account } from "../types/models";
import { closeTab, connectHost, retryTab } from "./sessionController";
import { clearRemotes } from "./promptActions";
import { writeCount } from "./writeLog";

const remote: Host = {
  id: "h-item10",
  name: "item10",
  group: "Lab",
  host: "127.0.0.1",
  port: 2222,
  username: "tester",
  password: "pw",
  identity_file: "",
  account: "lab",
  color: "",
  font: "",
  tunnels: "",
  extra_arguments: "",
  ssh_config: "",
};

const account: Account = {
  id: "a1",
  name: "lab",
  username: "keyuser",
  password: "account-pass",
  identity_file: "~/id",
};

/** The writer batches per frame; wait for one frame to land. */
async function flushFrames(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

const firstTabId = (): string => Object.keys(useAppStore.getState().tabs)[0]!;

beforeEach(() => {
  bus.clear();
  calls.spawn.length = 0;
  calls.write.length = 0;
  calls.killed.length = 0;
  registry.reset();
  clearRemotes();
  vi.mocked(ipc.spawnSession).mockClear();
  useAppStore.setState({
    hosts: [remote, LOCALHOST_HOST],
    accounts: [account],
    settings: { ...DEFAULT_SETTINGS },
    tabs: {},
    tabOrder: {},
    activeTabByHost: {},
    dialogs: [],
    modals: [],
    toasts: [],
    selectedHostId: null,
    sidebarMode: "hosts",
  });
});

afterEach(() => {
  useAppStore.setState({ tabs: {}, tabOrder: {}, activeTabByHost: {}, dialogs: [] });
});

describe("sessionController (remote sessions)", () => {
  it("spawns with the account credentials resolved in the Host copy", async () => {
    await connectHost(remote);
    expect(calls.spawn).toHaveLength(1);
    const sent = calls.spawn[0]!.host;
    expect(sent.username).toBe("keyuser");
    expect(sent.password).toBe("account-pass");
    expect(sent.identity_file).toBe("~/id");
  });

  it("sends the password once, never again after login", async () => {
    await connectHost(remote);
    const sid = calls.spawn[0]!.sessionId;
    bus.emit(`pty-output-${sid}`, "tester@127.0.0.1's password: ");
    expect(calls.write).toEqual([{ sessionId: sid, data: "account-pass\n" }]);

    bus.emit(`pty-output-${sid}`, "\ntester@host:~$ ");
    bus.emit(`pty-output-${sid}`, "[sudo] password for tester: ");
    expect(calls.write.filter((w) => w.data === "account-pass\n")).toHaveLength(1);
  });

  it("queues one fingerprint dialog per tab", async () => {
    await connectHost(remote);
    const sid = calls.spawn[0]!.sessionId;
    bus.emit(`pty-output-${sid}`, "Are you sure you want to continue connecting (yes/no/[fingerprint])?");
    const dialogs = useAppStore.getState().dialogs;
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0]?.kind).toBe("fingerprint");
    bus.emit(`pty-output-${sid}`, "still asking (yes/no)");
    expect(useAppStore.getState().dialogs).toHaveLength(1);
  });

  it("after Retry the old session's output never reaches the terminal", async () => {
    await connectHost(remote);
    const tabId = firstTabId();
    const oldSession = calls.spawn[0]!.sessionId;
    bus.emit(`pty-output-${oldSession}`, "OLD");
    await flushFrames();
    expect(registry.writes(tabId)).toContain("OLD");

    await retryTab(tabId);
    const newSession = calls.spawn[1]!.sessionId;
    expect(newSession).not.toBe(oldSession);
    expect(calls.killed).toContain(oldSession);
    expect(registry.writes(tabId)).toBe(""); // term.reset() cleared the buffer
    expect(bus.count(`pty-output-${oldSession}`)).toBe(0);

    bus.emit(`pty-output-${oldSession}`, "STALE");
    await flushFrames();
    expect(registry.writes(tabId)).toBe("");

    bus.emit(`pty-output-${newSession}`, "FRESH");
    await flushFrames();
    expect(registry.writes(tabId)).toContain("FRESH");
  });

  it("Retry clears the login flags and asks for the password again", async () => {
    await connectHost(remote);
    const tabId = firstTabId();
    const oldSession = calls.spawn[0]!.sessionId;
    bus.emit(`pty-output-${oldSession}`, "password: ");
    bus.emit(`pty-output-${oldSession}`, "tester@host:~$ ");
    expect(useAppStore.getState().tabs[tabId]?.loggedIn).toBe(true);

    await retryTab(tabId);
    const flags = useAppStore.getState().tabs[tabId]!;
    expect(flags.loggedIn).toBe(false);
    expect(flags.exited).toBe(false);
    const newSession = calls.spawn[1]!.sessionId;
    bus.emit(`pty-output-${newSession}`, "password: ");
    expect(calls.write.filter((w) => w.data === "account-pass\n")).toHaveLength(2);
  });

  it("counts the password writes for the e2e hook", async () => {
    await connectHost(remote);
    const tabId = firstTabId();
    bus.emit(`pty-output-${calls.spawn[0]!.sessionId}`, "password: ");
    expect(writeCount(tabId, "account-pass\n")).toBe(1);
    registry.typed(tabId, "account-pass\n"); // the user typing it themselves
    expect(writeCount(tabId, "account-pass\n")).toBe(2);
  });

  it("keeps the tab on a refused connection and queues exactly one error dialog", async () => {
    await connectHost(remote);
    const tabId = firstTabId();
    const sid = calls.spawn[0]!.sessionId;
    bus.emit(`pty-output-${sid}`, "ssh: connect to host 127.0.0.1 port 2299: Connection refused");
    expect(useAppStore.getState().dialogs).toHaveLength(1);

    bus.emit(`pty-exit-${sid}`, 255);
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(useAppStore.getState().tabs[tabId]).toBeTruthy();
    expect(useAppStore.getState().dialogs).toHaveLength(1);
    expect(registry.writes(tabId)).toContain("[Process exited with code 255]");
  });

  it("closes the tab after logout plus a clean exit code", async () => {
    await connectHost(remote);
    const tabId = firstTabId();
    const sid = calls.spawn[0]!.sessionId;
    bus.emit(`pty-output-${sid}`, "tester@host:~$ ");
    bus.emit(`pty-output-${sid}`, "logout\r\nConnection to 127.0.0.1 closed.\r\n");
    bus.emit(`pty-exit-${sid}`, 0);
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(useAppStore.getState().tabs[tabId]).toBeUndefined();
    expect(calls.killed).toContain(sid);
  });

  it("a local tab still closes on exit", async () => {
    await connectHost(LOCALHOST_HOST);
    const tabId = firstTabId();
    bus.emit(`pty-exit-${calls.spawn[0]!.sessionId}`, 0);
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(useAppStore.getState().tabs[tabId]).toBeUndefined();
  });

  it("closing a tab drops its queued dialogs", async () => {
    await connectHost(remote);
    const tabId = firstTabId();
    bus.emit(`pty-output-${calls.spawn[0]!.sessionId}`, "(yes/no/[fingerprint])?");
    expect(useAppStore.getState().dialogs).toHaveLength(1);
    closeTab(tabId);
    expect(useAppStore.getState().dialogs).toEqual([]);
  });

  it("spawn failures close the tab and raise a toast", async () => {
    vi.mocked(ipc.spawnSession).mockRejectedValueOnce("ssh: bad host");
    await connectHost(remote);
    expect(Object.keys(useAppStore.getState().tabs)).toHaveLength(0);
    expect(useAppStore.getState().toasts[0]?.message).toContain("bad host");
  });
});
