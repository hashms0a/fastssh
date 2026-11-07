import { beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ModalHost } from "./ModalHost";
import { useAppStore } from "../../store/useAppStore";

/** Task 3.10: the confirm dialog - queue, Escape = Cancel, focus in/out. */
beforeEach(() => {
  useAppStore.setState({ modals: [], toasts: [] });
});

const ask = () => {
  void useAppStore.getState().confirm({ title: "Remove", message: "Remove web-1?" });
};

describe("confirm dialog", () => {
  it("shows the queued request and answers OK", async () => {
    render(<ModalHost />);
    act(ask);
    expect(screen.getByTestId("confirm-title").textContent).toBe("Remove");
    expect(screen.getByTestId("confirm-message").textContent).toBe("Remove web-1?");
    fireEvent.click(screen.getByTestId("confirm-ok"));
    await act(async () => Promise.resolve());
  });

  it("Escape means Cancel and closes the dialog", async () => {
    render(<ModalHost />);
    act(ask);
    const dialog = screen.getByTestId("confirm-dialog");
    // The dialog takes focus on open, so the key goes to it.
    expect(document.activeElement?.closest('[data-testid="confirm-dialog"]')).toBeTruthy();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
    await act(async () => Promise.resolve());
  });

  it("cancels through the Cancel button and queues a second request", async () => {
    render(<ModalHost />);
    act(ask);
    act(() => void useAppStore.getState().confirm({ title: "Second", message: "b" }));
    expect(screen.getByTestId("confirm-title").textContent).toBe("Remove");
    fireEvent.click(screen.getByTestId("confirm-cancel"));
    expect(screen.getByTestId("confirm-title").textContent).toBe("Second");
    fireEvent.click(screen.getByTestId("confirm-ok"));
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
  });
});
