import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import App from "../App";
import { useAppStore } from "../store/useAppStore";
import { DEFAULT_SETTINGS, LOCALHOST_HOST, type Host } from "../types/models";
import { emptyReport, installIpcMock } from "../test/ipcMock";

// The window APIs the shell hooks subscribe to.
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () =>
    new Proxy(
      {},
      {
        get: (_t, k) =>
          k === "label"
            ? "main"
            : () =>
                Promise.resolve(typeof k === "string" && k.startsWith("on") ? () => {} : { width: 1280, height: 800 }),
      },
    ),
}));

function host(name: string, over: Partial<Host> = {}): Host {
  return { ...LOCALHOST_HOST, ...over, id: name, name, local: undefined };
}

beforeEach(() => {
  installIpcMock();
  useAppStore
    .getState()
    .hydrate(emptyReport({ hosts: [host("alpha"), host("beta")], accounts: [], settings: DEFAULT_SETTINGS }));
  useAppStore.setState({ modals: [], editor: null, toasts: [], selectedHostId: null, selectedAccountId: null });
});

describe("app shell", () => {
  it("shows the first host's landing card and opens the editor from the header", async () => {
    render(<App />);
    // The local shell is the first row of the legacy library (Section 4.2).
    expect(screen.getByTestId("landing-name").textContent).toBe("Localhost");
    fireEvent.click(screen.getByTestId("new-connection"));
    expect(screen.getByTestId("connection-editor")).toBeTruthy();
    // A click in the sidebar moves the landing card to that host.
    fireEvent.click(screen.getByTestId("editor-cancel"));
    const rows = screen.getAllByTestId("host-row") as HTMLElement[];
    fireEvent.click(rows.find((r) => r.dataset.name === "beta")!);
    expect(screen.getByTestId("landing-name").textContent).toBe("beta");
  });
});
