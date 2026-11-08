import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DEFAULT_SETTINGS, LOCALHOST_HOST, type Account, type Host } from "../types/models";
import { newHost } from "./hostUtils";
import { useAppStore } from "../store/useAppStore";
import { callsTo, installIpcMock, type MockBackend } from "../test/ipcMock";
import { isLocalHost, showFileBrowserFor, urlInMessage } from "./fileBrowser";
import { errorText } from "./errorText";
import { strings } from "./strings";
import { Toasts } from "../components/Toasts";

let backend: MockBackend;

const remote = (): Host => newHost({ id: "h1", name: "item10", host: "127.0.0.1", port: 2222, username: "tester" });

const ACCOUNTS: Account[] = [{ id: "a1", name: "lab-key", username: "keyuser", password: "", identity_file: "" }];

beforeEach(() => {
  backend = installIpcMock();
  useAppStore.setState({
    settings: DEFAULT_SETTINGS,
    hosts: [],
    accounts: [],
    bookmarks: [],
    toasts: [],
    warnings: [],
  });
});

describe("errorText", () => {
  it("unwraps a Rust AppError, an Error and a plain string", () => {
    expect(errorText({ code: "open", message: "boom" })).toBe("boom");
    expect(errorText(new Error("nope"))).toBe("nope");
    expect(errorText("just text")).toBe("just text");
    expect(errorText(undefined)).toBe("undefined");
  });
});

describe("urlInMessage", () => {
  it("finds the address the Rust error names", () => {
    expect(urlInMessage("Could not open a file browser. Copy this address: sftp://a@h:22/")).toBe("sftp://a@h:22/");
    expect(urlInMessage("open https://example.com/x now")).toBe("https://example.com/x");
    expect(urlInMessage("file:///etc/passwd")).toBeNull();
    expect(urlInMessage("nothing here")).toBeNull();
  });
});

describe("showFileBrowserFor (task 7.4)", () => {
  it("calls the command with the host's address", async () => {
    await showFileBrowserFor(remote());
    const calls = callsTo(backend, "open_sftp_file_browser");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toEqual({ username: "tester", host: "127.0.0.1", port: 2222 });
    expect(useAppStore.getState().toasts).toEqual([]);
  });

  it("uses the linked account's username", async () => {
    useAppStore.setState({ accounts: ACCOUNTS });
    const linked = remote();
    linked.account = "lab-key";
    await showFileBrowserFor(linked);
    expect(callsTo(backend, "open_sftp_file_browser")[0]?.args.username).toBe("keyuser");
  });

  it("in sync mode opens the block's real address, not the alias", async () => {
    useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, syncSshConfig: true }, accounts: ACCOUNTS });
    const h = remote();
    h.host = "web1";
    h.ssh_config = "Host web1\n    HostName 127.0.0.1\n    Port 2222\n    User keyuser";
    await showFileBrowserFor(h);
    expect(callsTo(backend, "open_sftp_file_browser")[0]?.args).toEqual({
      username: "keyuser",
      host: "127.0.0.1",
      port: 2222,
    });
  });

  it("refuses Localhost without calling the command (R16 is remote-only)", async () => {
    expect(isLocalHost(LOCALHOST_HOST)).toBe(true);
    await showFileBrowserFor(LOCALHOST_HOST);
    expect(callsTo(backend, "open_sftp_file_browser")).toHaveLength(0);
    expect(useAppStore.getState().toasts[0]?.message).toBe(strings.fileBrowserLocalOnly);
  });

  it("refuses a host with no address", async () => {
    const blank = remote();
    blank.host = "   ";
    expect(isLocalHost(blank)).toBe(true);
    await showFileBrowserFor(blank);
    expect(callsTo(backend, "open_sftp_file_browser")).toHaveLength(0);
    expect(useAppStore.getState().toasts[0]?.message).toBe(strings.fileBrowserLocalOnly);
  });
});

/** Acceptance `[unit]`: the failure toast names the URL and its Copy button
 *  writes the URL to the clipboard (mocked IPC). */
describe("the failure toast (task 7.5)", () => {
  const FAIL = "Could not open a file browser. Copy this address: sftp://tester@127.0.0.1:2222/";

  it("keeps the error toast until dismissed and carries the URL for copying", async () => {
    backend.failNext("open_sftp_file_browser", FAIL);
    await showFileBrowserFor(remote());
    const toast = useAppStore.getState().toasts[0];
    expect(toast?.kind).toBe("error");
    expect(toast?.message).toContain("sftp://tester@127.0.0.1:2222/");
    expect(toast?.copy).toBe("sftp://tester@127.0.0.1:2222/");
  });

  it("renders a Copy button that writes the URL to the clipboard", async () => {
    backend.failNext("open_sftp_file_browser", FAIL);
    await showFileBrowserFor(remote());
    render(<Toasts />);
    fireEvent.click(screen.getByTestId("toast-copy"));
    await waitFor(() => expect(callsTo(backend, "plugin:clipboard-manager|write_text")).toHaveLength(1));
    expect(callsTo(backend, "plugin:clipboard-manager|write_text")[0]?.args.text).toBe("sftp://tester@127.0.0.1:2222/");
    await waitFor(() => expect(useAppStore.getState().toasts.map((t) => t.message)).toContain(strings.copiedUrl));
  });

  it("a toast without an address has no Copy button", async () => {
    backend.failNext("open_sftp_file_browser", "no address in this message");
    await showFileBrowserFor(remote());
    render(<Toasts />);
    expect(screen.queryByTestId("toast-copy")).toBeNull();
    expect(screen.getAllByTestId("toast-dismiss").length).toBeGreaterThan(0);
  });
});
