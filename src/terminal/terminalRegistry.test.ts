import { afterEach, describe, expect, it } from "vitest";
import { attach, createTerminal, dispose, disposeAll, shouldFit } from "./terminalRegistry";

describe("terminalRegistry", () => {
  afterEach(() => disposeAll());

  it("shouldFit skips a host div of size 0 or an unopened terminal", () => {
    expect(shouldFit(false, 800, 600)).toBe(false);
    expect(shouldFit(true, 0, 600)).toBe(false);
    expect(shouldFit(true, 800, 0)).toBe(false);
    expect(shouldFit(true, 800, 600)).toBe(true);
  });

  it("createTerminal is idempotent, so StrictMode cannot double-create", () => {
    const a = createTerminal("t1", {});
    expect(createTerminal("t1", {})).toBe(a);
    dispose("t1");
    expect(createTerminal("t1", {})).not.toBe(a);
  });

  it("attach moves the host div between containers", () => {
    const entry = createTerminal("t2", {});
    entry.opened = true; // term.open() needs layout APIs jsdom lacks
    const boxA = document.createElement("div");
    const boxB = document.createElement("div");
    attach("t2", boxA);
    expect(entry.host.parentElement).toBe(boxA);
    attach("t2", boxA); // re-attaching the same container is a no-op
    expect(entry.host.parentElement).toBe(boxA);
    attach("t2", boxB);
    expect(entry.host.parentElement).toBe(boxB);
  });

  it("dispose removes the entry and the host div", () => {
    const box = document.createElement("div");
    const entry = createTerminal("t3", {});
    entry.opened = true;
    attach("t3", box);
    dispose("t3");
    expect(entry.host.parentElement).toBeNull();
    expect(createTerminal("t3", {})).not.toBe(entry); // a fresh entry after dispose
  });
});
