import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TabButton } from "./TabButton";
import { tabIdsOf } from "../../store/slices/tabsSlice";
import { useAppStore } from "../../store/useAppStore";
import type { TerminalTab } from "../../store/slices/tabsSlice";

const tab = (id: string, title: string): TerminalTab => ({
  id,
  hostId: "h1",
  sessionId: `s-${id}`,
  title,
  unread: false,
  loggedIn: false,
  exited: false,
  exitCode: null,
});

const noop = (): void => undefined;

function renderTab(tabId: string, title: string): void {
  useAppStore.setState({
    tabs: { a: tab("a", title), b: tab("b", "b") },
    tabOrder: { h1: ["a", "b"] },
    activeTabByHost: { h1: "a" },
  });
  render(
    <TabButton
      tabId={tabId}
      hostId="h1"
      active={tabId === "a"}
      dragTarget={false}
      onDragStart={noop}
      onDragEnd={noop}
      onDropOn={noop}
    />,
  );
}

beforeEach(() => useAppStore.setState({ tabs: {}, tabOrder: {}, activeTabByHost: {} }));

describe("Stage 11 tab gestures", () => {
  it("is draggable and reports the drag to the notebook", () => {
    renderTab("a", "Localhost");
    const el = screen.getByTestId("tab");
    expect(el.getAttribute("draggable")).toBe("true");
    fireEvent.dragStart(el);
    expect(el.getAttribute("data-title")).toBe("Localhost");
  });

  it("a drop on another tab goes through the notebook callback", () => {
    let dropped: string | null = null;
    useAppStore.setState({
      tabs: { a: tab("a", "a"), b: tab("b", "b") },
      tabOrder: { h1: ["a", "b"] },
      activeTabByHost: { h1: "a" },
    });
    render(
      <TabButton
        tabId="b"
        hostId="h1"
        active={false}
        dragTarget
        onDragStart={noop}
        onDragEnd={noop}
        onDropOn={(id) => {
          dropped = id;
        }}
      />,
    );
    const el = screen.getByTestId("tab");
    fireEvent.dragOver(el);
    fireEvent.drop(el);
    expect(dropped).toBe("b");
  });

  it("a double-click opens the rename field and Enter stores the new title", () => {
    renderTab("a", "Localhost");
    fireEvent.doubleClick(screen.getByTestId("tab"));
    const field = screen.getByTestId("tab-rename") as HTMLInputElement;
    expect(field.value).toBe("Localhost");
    fireEvent.change(field, { target: { value: "  build box  " } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(useAppStore.getState().tabs.a?.title).toBe("build box");
    expect(screen.queryByTestId("tab-rename")).toBeNull();
    expect(screen.getByTestId("tab").getAttribute("data-title")).toBe("build box");
  });

  it("Enter on an empty field keeps the old title", () => {
    renderTab("a", "item2");
    fireEvent.doubleClick(screen.getByTestId("tab"));
    const field = screen.getByTestId("tab-rename") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "   " } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(useAppStore.getState().tabs.a?.title).toBe("item2");
  });

  it("Escape cancels the rename", () => {
    renderTab("a", "item2");
    fireEvent.doubleClick(screen.getByTestId("tab"));
    const field = screen.getByTestId("tab-rename") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "tmp" } });
    fireEvent.keyDown(field, { key: "Escape" });
    expect(useAppStore.getState().tabs.a?.title).toBe("item2");
    expect(screen.queryByTestId("tab-rename")).toBeNull();
  });

  it("blur commits once the field has had the focus", async () => {
    renderTab("a", "item2");
    fireEvent.doubleClick(screen.getByTestId("tab"));
    const field = screen.getByTestId("tab-rename") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "deploy" } });
    fireEvent.blur(field); // the pane that just mounted grabbed the focus
    expect(screen.queryByTestId("tab-rename")).not.toBeNull(); // still editing
    expect(useAppStore.getState().tabs.a?.title).toBe("item2");
    await new Promise((r) => setTimeout(r, 320));
    fireEvent.blur(field);
    expect(useAppStore.getState().tabs.a?.title).toBe("deploy");
  });

  it("renaming never reorders the notebook", () => {
    renderTab("a", "a");
    fireEvent.doubleClick(screen.getByTestId("tab"));
    const field = screen.getByTestId("tab-rename") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "first" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(tabIdsOf(useAppStore.getState(), "h1")).toEqual(["a", "b"]);
  });
});
