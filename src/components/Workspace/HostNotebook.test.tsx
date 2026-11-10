import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { HostNotebook } from "./HostNotebook";
import { tabIdsOf } from "../../store/slices/tabsSlice";
import type { TerminalTab } from "../../store/slices/tabsSlice";
import { useAppStore } from "../../store/useAppStore";
import type { Host } from "../../types/models";

// The notebook only needs the tab bar and the panes; spawning is out of scope.
vi.mock("../../terminal/sessionController", () => ({ connectHost: vi.fn(), closeTab: vi.fn() }));

// jsdom has no ResizeObserver, and TerminalPane watches its container.
class FakeResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;

const host: Host = {
  id: "h1",
  name: "Box",
  group: "",
  host: "box",
  port: 22,
  username: "u",
  password: "",
  identity_file: "",
  account: "",
  color: "",
  font: "",
  tunnels: "",
  extra_arguments: "",
  ssh_config: "",
};

const tab = (id: string): TerminalTab => ({
  id,
  hostId: "h1",
  sessionId: `s-${id}`,
  title: id,
  unread: false,
  loggedIn: false,
  exited: false,
  exitCode: null,
});

/** The tab rows and the panes, in the order the notebook renders them. */
const q = (selector: string): HTMLElement => document.querySelector(selector) as HTMLElement;
const tabOrderOnScreen = (): string[] =>
  [...document.querySelectorAll<HTMLElement>('[data-testid="tab"]')].map((el) => el.getAttribute("data-tab-id") ?? "");
const paneOf = (tabId: string): HTMLElement => q(`[data-testid="terminal-pane"][data-tab-id="${tabId}"]`);
const tabElement = (tabId: string): HTMLElement => q(`[data-testid="tab"][data-tab-id="${tabId}"]`);

/** Drag `from` onto `to`, the way the webview drives it. */
function drag(from: string, to: string): void {
  fireEvent.dragStart(tabElement(from));
  fireEvent.dragOver(tabElement(to));
  fireEvent.drop(tabElement(to));
  fireEvent.dragEnd(tabElement(from));
}

beforeEach(() => {
  useAppStore.setState({
    tabs: Object.fromEntries(["a", "b", "c"].map((id) => [id, tab(id)])),
    tabOrder: { h1: ["a", "b", "c"] },
    activeTabByHost: { h1: "b" },
    selectedHostId: "h1",
  });
});

describe("notebook drag reorder", () => {
  it("drops the dragged tab onto the target's slot", () => {
    render(<HostNotebook host={host} visible />);
    expect(tabOrderOnScreen()).toEqual(["a", "b", "c"]);

    drag("a", "c");

    expect(tabOrderOnScreen()).toEqual(["b", "c", "a"]);
    expect(tabIdsOf(useAppStore.getState(), "h1")).toEqual(["b", "c", "a"]);
  });

  it("reorder never remounts a pane, so scrollback and the SSH session survive", () => {
    render(<HostNotebook host={host} visible />);
    const before = { a: paneOf("a"), b: paneOf("b"), c: paneOf("c") };

    drag("a", "c");

    expect(tabOrderOnScreen()).toEqual(["b", "c", "a"]);
    // The very same DOM nodes: React moved keyed children, it never disposed
    // an xterm host div or a PTY listener.
    expect(paneOf("a")).toBe(before.a);
    expect(paneOf("b")).toBe(before.b);
    expect(paneOf("c")).toBe(before.c);
  });

  it("keeps the active tab selected across a drag and clears the drop line", () => {
    render(<HostNotebook host={host} visible />);

    drag("a", "c");

    expect(useAppStore.getState().activeTabByHost.h1).toBe("b");
    expect(tabElement("b").getAttribute("aria-selected")).toBe("true");
    expect(tabElement("b").className).not.toContain("border-dashed");
    // The visible pane is still the active tab's, wherever it now sits.
    const visiblePane = [...document.querySelectorAll<HTMLElement>('[data-testid="terminal-pane"]')].find(
      (el) => !el.classList.contains("hidden"),
    );
    expect(visiblePane).toBe(paneOf("b"));
  });

  it("shows a drop line on the targets and fades the dragged tab", () => {
    render(<HostNotebook host={host} visible />);
    fireEvent.dragStart(tabElement("a"));

    expect(tabElement("a").className).toContain("opacity-50");
    expect(tabElement("b").className).toContain("border-dashed");
    expect(tabElement("c").className).toContain("border-dashed");

    fireEvent.dragEnd(tabElement("a"));
    expect(tabElement("a").className).not.toContain("opacity-50");
    expect(tabElement("b").className).not.toContain("border-dashed");
  });

  it("a click on a tab selects it without dragging it", () => {
    render(<HostNotebook host={host} visible />);
    fireEvent.click(tabElement("c"));
    expect(useAppStore.getState().activeTabByHost.h1).toBe("c");
    expect(tabIdsOf(useAppStore.getState(), "h1")).toEqual(["a", "b", "c"]);
  });
});
