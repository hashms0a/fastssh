import { beforeEach, describe, expect, it } from "vitest";
import { create } from "zustand";
import type { StateCreator } from "zustand";
import { createDialogSlice, hasDialogForTab, type DialogRequest } from "./dialogSlice";
import type { AppStore } from "../useAppStore";

type DialogStore = Pick<AppStore, "dialogs" | "enqueueDialog" | "dismissDialog" | "dropDialogsForTab">;

/** The queue on its own: it depends on no other slice. */
const useDialogs = create<DialogStore>()(createDialogSlice as StateCreator<DialogStore, [], [], DialogStore>);

const error = (tabId: string) => ({
  kind: "connection-error" as const,
  tabId,
  errorKind: "refused" as const,
  line: "",
});

beforeEach(() => {
  useDialogs.setState({ dialogs: [] });
});

describe("dialogSlice", () => {
  it("queues dialogs in order and numbers them", () => {
    useDialogs.getState().enqueueDialog({ kind: "fingerprint", tabId: "t1", text: "ED25519 SHA256:x" });
    useDialogs.getState().enqueueDialog(error("t2"));
    const dialogs = useDialogs.getState().dialogs;
    expect(dialogs.map((d) => d.tabId)).toEqual(["t1", "t2"]);
    expect(dialogs[1]?.kind).toBe("connection-error");
    expect(dialogs[1]!.id).toBeGreaterThan(dialogs[0]!.id);
  });

  it("ignores a second dialog of the same kind for the same tab", () => {
    const { enqueueDialog } = useDialogs.getState();
    enqueueDialog(error("t1"));
    enqueueDialog(error("t1"));
    enqueueDialog({ kind: "fingerprint", tabId: "t1", text: "x" });
    expect(useDialogs.getState().dialogs).toHaveLength(2);
  });

  it("dismiss removes exactly one dialog", () => {
    const { enqueueDialog, dismissDialog } = useDialogs.getState();
    enqueueDialog({ kind: "fingerprint", tabId: "t1", text: "a" });
    enqueueDialog(error("t2"));
    const first = useDialogs.getState().dialogs[0] as DialogRequest;
    dismissDialog(first.id);
    expect(useDialogs.getState().dialogs.map((d) => d.tabId)).toEqual(["t2"]);
    dismissDialog(9999); // an unknown id is a no-op
    expect(useDialogs.getState().dialogs).toHaveLength(1);
  });

  it("dropDialogsForTab removes every dialog of a closed tab", () => {
    const { enqueueDialog, dropDialogsForTab } = useDialogs.getState();
    enqueueDialog({ kind: "fingerprint", tabId: "t1", text: "a" });
    enqueueDialog(error("t1"));
    enqueueDialog(error("t2"));
    expect(hasDialogForTab(useDialogs.getState(), "t1")).toBe(true);
    dropDialogsForTab("t1");
    expect(hasDialogForTab(useDialogs.getState(), "t1")).toBe(false);
    expect(useDialogs.getState().dialogs.map((d) => d.tabId)).toEqual(["t2"]);
  });
});
