import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ModalHost } from "./ModalHost";
import type { DialogInput } from "../../store/slices/dialogSlice";
import { useAppStore } from "../../store/useAppStore";

/**
 * Stage 5 tasks 5.6 and 5.7: the two tab dialogs, driven through the queue.
 * The session actions are mocked, so each test proves what a button does
 * (answer the prompt / retry / close) without a PTY.
 */
const writePty = vi.hoisted(() => vi.fn(async () => undefined));
const retryTab = vi.hoisted(() => vi.fn(async () => undefined));
const closeTab = vi.hoisted(() => vi.fn());

vi.mock("../../lib/ipc", () => ({
  ipc: {
    writePty: writePty,
    spawnSession: vi.fn(async () => undefined),
    resizePty: vi.fn(async () => undefined),
    killSession: vi.fn(async () => undefined),
  },
}));

vi.mock("../../terminal/sessionController", () => ({ retryTab, closeTab }));

const tab = {
  id: "t1",
  hostId: "h1",
  sessionId: "s1",
  title: "item10",
  unread: false,
  loggedIn: false,
  exited: false,
  exitCode: null,
};

/** Store updates must run inside act() so React re-renders the dialog host. */
const queue = (dialog: DialogInput) => act(() => void useAppStore.getState().enqueueDialog(dialog));
const askConfirm = () => act(() => void useAppStore.getState().confirm({ title: "Remove", message: "Remove item10?" }));
const errorLine = "ssh: connect to host 127.0.0.1 port 2299: Connection refused";
const queueError = () => queue({ kind: "connection-error", tabId: "t1", errorKind: "refused", line: errorLine });

beforeEach(() => {
  writePty.mockClear();
  retryTab.mockClear();
  closeTab.mockClear();
  useAppStore.setState({ modals: [], dialogs: [], tabs: { t1: tab }, toasts: [] });
});

describe("fingerprint modal", () => {
  it("shows the key lines and answers Yes by writing yes\\n", () => {
    render(<ModalHost />);
    queue({
      kind: "fingerprint",
      tabId: "t1",
      text: "ED25519 SHA256:abc\nAre you sure you want to continue connecting (yes/no/[fingerprint])?",
    });
    expect(screen.getByTestId("fingerprint-text").textContent).toContain("ED25519 SHA256:abc");
    fireEvent.click(screen.getByTestId("fingerprint-yes"));
    expect(writePty).toHaveBeenCalledWith("s1", "yes\n");
    expect(screen.queryByTestId("fingerprint-modal")).toBeNull();
  });

  it("No writes no\\n and closes the dialog", () => {
    render(<ModalHost />);
    queue({ kind: "fingerprint", tabId: "t1", text: "x" });
    fireEvent.click(screen.getByTestId("fingerprint-no"));
    expect(writePty).toHaveBeenCalledWith("s1", "no\n");
    expect(useAppStore.getState().dialogs).toEqual([]);
  });

  it("answers the session the tab has now, not the one it opened with", () => {
    useAppStore.setState({ tabs: { t1: { ...tab, sessionId: "s-new" } } });
    render(<ModalHost />);
    queue({ kind: "fingerprint", tabId: "t1", text: "x" });
    fireEvent.click(screen.getByTestId("fingerprint-yes"));
    expect(writePty).toHaveBeenCalledWith("s-new", "yes\n");
  });

  it("focuses the Yes button on open", () => {
    render(<ModalHost />);
    queue({ kind: "fingerprint", tabId: "t1", text: "x" });
    expect(document.activeElement?.getAttribute("data-testid")).toBe("fingerprint-yes");
  });
});

describe("connection error modal", () => {
  it("shows the friendly text and the raw line", () => {
    render(<ModalHost />);
    queueError();
    expect(screen.getByTestId("connection-error-message").textContent).toBe("Connection refused");
    expect(screen.getByTestId("connection-error-line").textContent).toContain("port 2299");
  });

  it("the host-key case names ssh-keygen -R and hides an empty raw line", () => {
    render(<ModalHost />);
    queue({ kind: "connection-error", tabId: "t1", errorKind: "hostkey", line: "" });
    expect(screen.getByTestId("connection-error-message").textContent).toBe("The host key has changed");
    expect(screen.getByTestId("connection-error-modal").textContent).toContain("ssh-keygen -R");
    expect(screen.queryByTestId("connection-error-line")).toBeNull();
  });

  it("Retry reconnects in the same tab and dismisses the dialog", () => {
    render(<ModalHost />);
    queueError();
    fireEvent.click(screen.getByTestId("connection-error-retry"));
    expect(retryTab).toHaveBeenCalledWith("t1");
    expect(useAppStore.getState().dialogs).toEqual([]);
  });

  it("Close closes the tab", () => {
    render(<ModalHost />);
    queueError();
    fireEvent.click(screen.getByTestId("connection-error-close"));
    expect(closeTab).toHaveBeenCalledWith("t1");
    expect(useAppStore.getState().dialogs).toEqual([]);
  });

  it("Escape means Close", () => {
    render(<ModalHost />);
    queueError();
    fireEvent.keyDown(screen.getByTestId("connection-error-modal"), { key: "Escape" });
    expect(closeTab).toHaveBeenCalledWith("t1");
  });

  it("a confirm request wins over a queued dialog", () => {
    render(<ModalHost />);
    queueError();
    askConfirm();
    expect(screen.getByTestId("confirm-title").textContent).toBe("Remove");
    fireEvent.click(screen.getByTestId("confirm-cancel"));
    expect(screen.getByTestId("connection-error-modal")).toBeTruthy();
  });
});
