import { describe, expect, it } from "vitest";
import { MAX_RESTORE_TABS_PER_HOST, RESTORE_STAGGER_MS, restorePlan, runRestore } from "./restore";
import { LOCALHOST_HOST, type Host, type OpenedHostState } from "../types/models";

function host(name: string, id = name): Host {
  return { ...LOCALHOST_HOST, id, name, host: "10.0.0.1", local: undefined };
}

const hosts: Host[] = [LOCALHOST_HOST, host("item10"), host("item2")];
const entry = (hostName: string, tabCount: number): OpenedHostState => ({ hostName, tabCount });

describe("restorePlan (task 8.5)", () => {
  it("keeps existing hosts in order and keeps the tab counts", () => {
    const plan = restorePlan([entry("item2", 2), entry("item10", 1)], hosts);
    expect(plan.map((p) => [p.host.name, p.tabCount])).toEqual([
      ["item2", 2],
      ["item10", 1],
    ]);
  });

  it("skips a host that no longer exists and an empty name", () => {
    const plan = restorePlan([entry("gone", 3), entry("   ", 2), entry("item10", 1)], hosts);
    expect(plan.map((p) => p.host.name)).toEqual(["item10"]);
  });

  it("clamps tabCount to the cap and drops a count below 1", () => {
    const plan = restorePlan([entry("item2", 500), entry("item10", 0), entry("item10", Number.NaN)], hosts);
    expect(plan).toHaveLength(1);
    expect(plan[0]?.tabCount).toBe(MAX_RESTORE_TABS_PER_HOST);
  });

  it("never restores Localhost", () => {
    expect(restorePlan([entry("Localhost", 2)], hosts)).toEqual([]);
  });
});

describe("runRestore (task 8.5)", () => {
  it("opens tabCount tabs per host and selects the first restored host", async () => {
    const opened: string[] = [];
    const selected: string[] = [];
    const slept: number[] = [];
    const plan = restorePlan([entry("item2", 2), entry("item10", 1)], hosts);
    await runRestore(plan, {
      open: (h) => {
        opened.push(h.name);
      },
      select: (h) => selected.push(h.name),
      sleep: async (ms) => {
        slept.push(ms);
      },
    });
    expect(opened).toEqual(["item2", "item2", "item10"]);
    // Selected when the first host starts and again at the end, so the first
    // restored host is the one in front (task 8.5).
    expect(selected).toEqual(["item2", "item2"]);
    expect(slept).toEqual([RESTORE_STAGGER_MS, RESTORE_STAGGER_MS, RESTORE_STAGGER_MS]);
  });

  it("stops when the app starts quitting", async () => {
    const opened: string[] = [];
    let quitting = false;
    const plan = restorePlan([entry("item2", 3)], hosts);
    await runRestore(plan, {
      open: (h) => {
        opened.push(h.name);
        if (opened.length === 2) quitting = true;
      },
      select: () => undefined,
      sleep: async () => undefined,
      stopped: () => quitting,
    });
    expect(opened).toHaveLength(2);
  });

  it("an empty plan opens and selects nothing", async () => {
    let opened = 0;
    let selected = 0;
    await runRestore([], {
      open: () => {
        opened++;
      },
      select: () => {
        selected++;
      },
      sleep: async () => undefined,
    });
    expect([opened, selected]).toEqual([0, 0]);
  });
});
