import { describe, expect, it } from "vitest";
import { disableSync, enableSync, type SyncDeps } from "./sshConfigSync";
import type { Host } from "../types/models";
import type { SyncInfo, SyncReport } from "./ipc";

const CONFIG = "/home/dev/fastssh-testenv/ssh/config";
const BACKUP = "/home/dev/fastssh-testenv/ssh/config.backup";

const host = (name: string, local = false): Host => ({
  id: `id-${name}`,
  name,
  group: "Lab",
  host: "127.0.0.1",
  port: 2222,
  username: "tester",
  password: "",
  identity_file: "",
  account: "",
  color: "",
  font: "",
  tunnels: "",
  extra_arguments: "",
  ssh_config: "",
  local: local ? true : undefined,
});

interface Calls {
  questions: Array<[string, string]>;
  enabled: Host[][];
  disabled: number;
  reloads: number;
  flags: Array<boolean | undefined>;
  toasts: Array<[string, string?]>;
}

const fresh = (): Calls => ({ questions: [], enabled: [], disabled: 0, reloads: 0, flags: [], toasts: [] });

function deps(calls: Calls, over: Partial<SyncDeps> = {}): SyncDeps {
  return {
    hosts: [host("Localhost", true), host("item10"), host("db2")],
    info: async (): Promise<SyncInfo> => ({ configPath: CONFIG, backupPath: BACKUP, hasConfig: true }),
    confirm: async (title, message) => {
      calls.questions.push([title, message]);
      return true;
    },
    enable: async (hosts) => {
      calls.enabled.push(hosts);
      return { backupPath: BACKUP, imported: [], skipped: [], hosts };
    },
    disable: async () => {
      calls.disabled += 1;
    },
    reload: async () => {
      calls.reloads += 1;
    },
    setSync: (on) => calls.flags.push(on),
    toast: (message, kind) => calls.toasts.push([message, kind]),
    ...over,
  };
}

const report = (imported: number, skipped: number): SyncReport => ({
  backupPath: BACKUP,
  imported: Array.from({ length: imported }, (_x, i) => host(`imported${i}`)),
  skipped: Array.from({ length: skipped }, (_x, i) => `skip${i}`),
  hosts: [],
});

describe("enableSync / disableSync (task 9.7)", () => {
  it("asks before rewriting the file and names both paths", async () => {
    const calls = fresh();
    const outcome = await enableSync(deps(calls));
    expect(calls.questions).toHaveLength(1);
    const asked = calls.questions[0]!;
    expect(asked[1]).toContain(CONFIG);
    expect(asked[1]).toContain(BACKUP);
    expect(asked[1]).toMatch(/Wildcard and Match blocks are kept/);
    expect(outcome).toBe("enabled");
  });

  it("says so when there is no config file to back up", async () => {
    const calls = fresh();
    await enableSync(deps(calls, { info: async () => ({ configPath: CONFIG, backupPath: BACKUP, hasConfig: false }) }));
    expect(calls.questions[0]?.[1]).toMatch(/no config file yet/);
    expect(calls.questions[0]?.[1]).not.toContain(BACKUP);
  });

  it("enables, re-reads the library, then sets the flag - in that order", async () => {
    const calls = fresh();
    const order: string[] = [];
    const d = deps(calls, {
      enable: async (hosts) => {
        order.push("enable");
        calls.enabled.push(hosts);
        return report(2, 0);
      },
      reload: async () => {
        order.push("reload");
      },
      setSync: (on) => {
        order.push(`flag:${on}`);
        calls.flags.push(on);
      },
    });
    await enableSync(d);
    expect(order).toEqual(["enable", "reload", "flag:true"]);
  });

  it("passes the whole library and lets Rust filter Localhost", async () => {
    const calls = fresh();
    await enableSync(deps(calls));
    expect(calls.enabled[0]?.map((h) => h.name)).toEqual(["Localhost", "item10", "db2"]);
  });

  it("the toast counts the imports and the skips", async () => {
    const calls = fresh();
    await enableSync(deps(calls, { enable: async () => report(5, 1) }));
    expect(calls.toasts[0]).toEqual(["Imported 5 hosts (1 skipped)", undefined]);
    expect(calls.flags).toEqual([true]);
  });

  it("one host is worded in the singular", async () => {
    const calls = fresh();
    await enableSync(deps(calls, { enable: async () => report(1, 0) }));
    expect(calls.toasts[0]?.[0]).toBe("Imported 1 host (0 skipped)");
  });

  it("Cancel enables nothing", async () => {
    const calls = fresh();
    const outcome = await enableSync(deps(calls, { confirm: async () => false }));
    expect(outcome).toBe("cancelled");
    expect(calls.enabled).toHaveLength(0);
    expect(calls.reloads).toBe(0);
    expect(calls.flags).toEqual([]);
    expect(calls.toasts).toEqual([]);
  });

  it("a failed enable reports the error and leaves sync off", async () => {
    const calls = fresh();
    const outcome = await enableSync(
      deps(calls, {
        enable: async () => {
          throw `${CONFIG}: Permission denied (os error 13)`;
        },
      }),
    );
    expect(outcome).toBe("failed");
    expect(calls.toasts[0]?.[1]).toBe("error");
    expect(calls.toasts[0]?.[0]).toContain("Permission denied");
    expect(calls.reloads).toBe(0);
    expect(calls.flags).toEqual([]);
  });

  it("disable clears the flag and says so", async () => {
    const calls = fresh();
    await disableSync(deps(calls));
    expect(calls.disabled).toBe(1);
    expect(calls.flags).toEqual([false]);
    expect(calls.toasts[0]?.[0]).toMatch(/sync is off/i);
  });

  it("a failed disable still reports the error instead of silently failing", async () => {
    const calls = fresh();
    await disableSync(
      deps(calls, {
        disable: async () => {
          throw "state: settings mutex poisoned";
        },
      }),
    );
    expect(calls.toasts[0]).toEqual(["state: settings mutex poisoned", "error"]);
    expect(calls.flags).toEqual([]);
  });
});
