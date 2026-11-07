import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { debounce } from "./debounce";

describe("debounce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("coalesces rapid calls into one run after ms", () => {
    const fn = vi.fn();
    const d = debounce(fn, 400);
    d.call();
    d.call();
    d.call();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(399);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("flush() runs a pending call immediately, then it is no longer pending", () => {
    const fn = vi.fn();
    const d = debounce(fn, 400);
    d.call();
    d.flush();
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("flush() without a pending call is a no-op", () => {
    const fn = vi.fn();
    const d = debounce(fn, 10);
    d.flush();
    expect(fn).not.toHaveBeenCalled();
  });

  it("cancel() drops the pending call", () => {
    const fn = vi.fn();
    const d = debounce(fn, 10);
    d.call();
    d.cancel();
    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled();
  });

  it("runs again after a completed cycle", () => {
    const fn = vi.fn();
    const d = debounce(fn, 10);
    d.call();
    vi.advanceTimersByTime(10);
    d.call();
    vi.advanceTimersByTime(10);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
