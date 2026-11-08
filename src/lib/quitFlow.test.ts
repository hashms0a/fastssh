import { beforeEach, describe, expect, it } from "vitest";
import { openedHostsFor, quitFlow, resetQuitGuard, type QuitDeps } from "./quitFlow";
import { DEFAULT_SETTINGS, LOCALHOST_HOST, type AppSettings, type Host } from "../types/models";

function host(name: string, id = name): Host {
  return { ...LOCALHOST_HOST, id, name, host: "10.0.0.1", local: undefined };
}

const hosts: Host[] = [LOCALHOST_HOST, host("item10"), host("item2")];

const tabOrder = {
  "local-localhost": ["a", "b"],
  item10: ["c"],
  item2: ["d", "e", "f"],
};

interface Log {
  order: string[];
  patches: Array<Partial<AppSettings>>;
}

function deps(log: Log, over: Partial<QuitDeps> = {}): QuitDeps {
  return {
    settings: DEFAULT_SETTINGS,
    hosts,
    tabOrder,
    patch: (p) => {
      log.order.push("patch");
      log.patches.push(p);
    },
    flush: async () => {
      log.order.push("flush");
    },
    quit: async () => {
      log.order.push("quit");
    },
    ...over,
  };
}

beforeEach(() => resetQuitGuard());

describe("openedHostsFor (task 8.4)", () => {
  it("lists hosts with tabs in open order and skips Localhost", () => {
    expect(openedHostsFor({ settings: DEFAULT_SETTINGS, hosts, tabOrder })).toEqual([
      { hostName: "item10", tabCount: 1 },
      { hostName: "item2", tabCount: 3 },
    ]);
  });

  it("lists Localhost too when restoreLocalhost is on", () => {
    const settings = { ...DEFAULT_SETTINGS, restoreHosts: true, restoreLocalhost: true };
    expect(openedHostsFor({ settings, hosts, tabOrder })).toEqual([
      { hostName: "Localhost", tabCount: 2 },
      { hostName: "item10", tabCount: 1 },
      { hostName: "item2", tabCount: 3 },
    ]);
  });

  it("keeps Localhost out when restoreHosts is off, whatever the new flag says", () => {
    const settings = { ...DEFAULT_SETTINGS, restoreHosts: false, restoreLocalhost: true };
    const log: Log = { order: [], patches: [] };
    return quitFlow(deps(log, { settings })).then(() => {
      expect(log.patches[0]?.openedHosts).toEqual([]);
    });
  });

  it("ignores empty notebooks and hosts that are gone", () => {
    const order = { item10: [], ghost: ["x"] };
    expect(openedHostsFor({ settings: DEFAULT_SETTINGS, hosts, tabOrder: order })).toEqual([]);
  });
});

describe("quitFlow (task 8.4)", () => {
  it("writes openedHosts, flushes, then quits - in that order", async () => {
    const log: Log = { order: [], patches: [] };
    const done = await quitFlow(deps(log, { settings: { ...DEFAULT_SETTINGS, restoreHosts: true } }));
    expect(done).toBe(true);
    expect(log.order).toEqual(["patch", "flush", "quit"]);
    expect(log.patches[0]?.openedHosts).toEqual([
      { hostName: "item10", tabCount: 1 },
      { hostName: "item2", tabCount: 3 },
    ]);
  });

  it("saves an empty list when Restore is off", async () => {
    const log: Log = { order: [], patches: [] };
    await quitFlow(deps(log, { settings: { ...DEFAULT_SETTINGS, restoreHosts: false } }));
    expect(log.patches[0]?.openedHosts).toEqual([]);
  });

  it("a second quit while quitting does nothing", async () => {
    const log: Log = { order: [], patches: [] };
    let release = (): void => undefined;
    const slow = deps(log, {
      flush: () =>
        new Promise<void>((resolve) => {
          log.order.push("flush");
          release = resolve;
        }),
    });
    const first = quitFlow(slow);
    expect(await quitFlow(deps(log))).toBe(false);
    expect(log.patches).toHaveLength(1); // the second call never patched
    release();
    expect(await first).toBe(true);
    expect(log.order).toEqual(["patch", "flush", "quit"]);
  });

  it("a failed save is reported and still quits", async () => {
    const log: Log = { order: [], patches: [] };
    const errors: unknown[] = [];
    const done = await quitFlow(
      deps(log, {
        flush: () => {
          log.order.push("flush");
          return Promise.reject(new Error("Permission denied"));
        },
        onError: (e) => errors.push(e),
      }),
    );
    expect(done).toBe(true);
    expect(errors).toHaveLength(1);
    expect(log.order).toEqual(["patch", "flush", "quit"]);
  });
});
