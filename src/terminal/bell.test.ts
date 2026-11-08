import { describe, expect, it, vi } from "vitest";
import { THROTTLE_MS, lastRingAtOf, resetBell, ringBell, shouldRing } from "./bell";

describe("audible bell (R12)", () => {
  it("throttle rule: one ring per THROTTLE_MS", () => {
    expect(THROTTLE_MS).toBe(200);
    expect(shouldRing(1000, 801)).toBe(false);
    expect(shouldRing(1000, 800)).toBe(true);
    expect(shouldRing(1000, 1000)).toBe(false);
  });

  it("a second bell inside the window is dropped (cat of a file full of BEL)", () => {
    resetBell();
    ringBell(() => true);
    const first = lastRingAtOf();
    expect(Number.isFinite(first)).toBe(true);
    ringBell(() => true);
    expect(lastRingAtOf()).toBe(first);
  });

  it("audibleBell off never starts a beep", () => {
    resetBell();
    expect(lastRingAtOf()).toBe(Number.NEGATIVE_INFINITY);
    ringBell(() => false);
    expect(lastRingAtOf()).toBe(Number.NEGATIVE_INFINITY);
  });

  it("the setting is read at ring time, not at wiring time", () => {
    resetBell();
    let on = false;
    const enabled = vi.fn(() => on);
    ringBell(enabled);
    expect(enabled).toHaveBeenCalledTimes(1);
    expect(lastRingAtOf()).toBe(Number.NEGATIVE_INFINITY);
    on = true;
    resetBell();
    ringBell(enabled);
    expect(Number.isFinite(lastRingAtOf())).toBe(true);
  });

  it("survives a missing AudioContext (jsdom has none)", () => {
    resetBell();
    expect(() => ringBell(() => true)).not.toThrow();
  });
});
