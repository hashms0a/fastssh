import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, LOCALHOST_HOST, type Host } from "../types/models";
import { newHost } from "../lib/hostUtils";
import { useAppStore } from "../store/useAppStore";
import { callsTo, installIpcMock, type MockBackend } from "../test/ipcMock";
import { strings } from "../lib/strings";
import { runBookmark, showFileBrowser } from "./terminalActions";

let backend: MockBackend;

const remote = (): Host => newHost({ id: "h1", name: "item10", host: "127.0.0.1", port: 2222, username: "tester" });

beforeEach(() => {
  backend = installIpcMock();
  useAppStore.setState({
    settings: DEFAULT_SETTINGS,
    hosts: [remote()],
    accounts: [],
    bookmarks: [],
    toasts: [],
    tabs: {},
    tabOrder: {},
    activeTabByHost: {},
    selectedHostId: null,
  });
});

describe("runBookmark (R3)", () => {
  it("writes the command and a newline to the active tab of the selected host", () => {
    useAppStore.setState({
      selectedHostId: "h1",
      tabs: {
        t1: {
          id: "t1",
          hostId: "h1",
          sessionId: "s1",
          title: "item10",
          unread: false,
          loggedIn: false,
          exited: false,
          exitCode: null,
        },
      },
      tabOrder: { h1: ["t1"] },
      activeTabByHost: { h1: "t1" },
    });
    runBookmark("echo bookmark-ok");
    expect(callsTo(backend, "write_pty")[0]?.args).toEqual({ sessionId: "s1", data: "echo bookmark-ok\n" });
    expect(useAppStore.getState().toasts).toEqual([]);
  });

  it("with no open tab it reports instead of writing", () => {
    useAppStore.setState({ selectedHostId: LOCALHOST_HOST.id });
    runBookmark("uptime");
    expect(callsTo(backend, "write_pty")).toHaveLength(0);
    expect(useAppStore.getState().toasts[0]?.message).toBe(strings.openTerminalFirst);
  });
});

describe("showFileBrowser (task 7.4)", () => {
  it("uses the selected host for the shortcut", () => {
    useAppStore.setState({ selectedHostId: "h1" });
    showFileBrowser();
    expect(callsTo(backend, "open_sftp_file_browser")[0]?.args).toEqual({
      username: "tester",
      host: "127.0.0.1",
      port: 2222,
    });
  });

  it("uses the host of the tab the menu was opened in", () => {
    const other = newHost({ id: "h2", name: "db2", host: "10.0.0.2", port: 2200, username: "pg" });
    useAppStore.setState({
      hosts: [remote(), other],
      selectedHostId: "h1",
      tabs: {
        t2: {
          id: "t2",
          hostId: "h2",
          sessionId: "s2",
          title: "db2",
          unread: false,
          loggedIn: false,
          exited: false,
          exitCode: null,
        },
      },
    });
    showFileBrowser("t2");
    expect(callsTo(backend, "open_sftp_file_browser")[0]?.args).toEqual({
      username: "pg",
      host: "10.0.0.2",
      port: 2200,
    });
  });

  it("with no selected host it explains instead of calling the command", () => {
    showFileBrowser();
    expect(callsTo(backend, "open_sftp_file_browser")).toHaveLength(0);
    expect(useAppStore.getState().toasts[0]?.message).toBe(strings.fileBrowserLocalOnly);
  });
});
