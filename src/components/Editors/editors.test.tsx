import { beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EditorOverlay } from "./EditorOverlay";
import { ModalHost } from "../Modals/ModalHost";
import { Toasts } from "../Toasts";
import { useAppStore } from "../../store/useAppStore";
import { DEFAULT_SETTINGS, LOCALHOST_HOST, type Account, type Host } from "../../types/models";
import {
  addAccount,
  addHost,
  duplicateAccountAction,
  duplicateHostAction,
  editAccount,
  editHost,
  removeAccountAction,
  removeHost,
} from "../../lib/editorActions";
import { emptyReport, installIpcMock, callsTo, type MockBackend } from "../../test/ipcMock";

let backend: MockBackend;

function host(name: string, over: Partial<Host> = {}): Host {
  return { ...LOCALHOST_HOST, ...over, id: name, name, local: undefined };
}

const labKey: Account = {
  id: "a1",
  name: "lab-key",
  username: "keyuser",
  password: "pw",
  identity_file: "~/.ssh/id_ed25519",
};

beforeEach(() => {
  backend = installIpcMock();
  useAppStore.getState().hydrate(
    emptyReport({
      hosts: [
        host("item2", { group: "Lab", account: "lab-key", username: "keyuser" }),
        host("item10", { group: "Lab", host: "127.0.0.1", port: 2222, username: "tester" }),
      ],
      accounts: [labKey],
      settings: DEFAULT_SETTINGS,
    }),
  );
  useAppStore.setState({ modals: [], editor: null, toasts: [], selectedHostId: null, selectedAccountId: null });
});

/** Opens the requested editor, then mounts the overlay + modal host. */
function overlay(open: () => unknown = addHost) {
  act(() => {
    open();
  });
  render(
    <>
      <EditorOverlay />
      <ModalHost />
      <Toasts />
    </>,
  );
}

const last = <T,>(list: T[]): T | undefined => list[list.length - 1];
const field = (testId: string) => screen.getByTestId(testId) as HTMLInputElement;
const click = (testId: string) => act(async () => fireEvent.click(screen.getByTestId(testId)));
const savedHosts = () => last(callsTo(backend, "save_hosts"))?.args.hosts as Host[];
const savedAccounts = () => last(callsTo(backend, "save_accounts"))?.args.accounts as Account[];

describe("ConnectionEditor: add / validate / save (tasks 3.4, 3.6, 3.13)", () => {
  it('saves "web 1" as "web-1" and writes it to disk', async () => {
    overlay();
    fireEvent.change(field("field-name"), { target: { value: "web 1" } });
    fireEvent.change(field("field-host"), { target: { value: "127.0.0.1" } });
    fireEvent.change(field("field-port"), { target: { value: "2222" } });
    await click("editor-save");
    expect(savedHosts().map((h) => h.name)).toEqual(["Localhost", "item2", "item10", "web-1"]);
    expect(savedHosts()[savedHosts().length - 1]).toMatchObject({ host: "127.0.0.1", port: 2222, group: "Local" });
    expect(screen.queryByTestId("editor-overlay")).toBeNull(); // closed after save
    expect(useAppStore.getState().toasts[0]?.message).toBe("Saved web-1");
  });

  it('shows "Name is already taken" and saves nothing', async () => {
    overlay(() => editHost(host("item2", { account: "lab-key" })));
    fireEvent.change(field("field-name"), { target: { value: "item10" } });
    await click("editor-save");
    expect((await screen.findByTestId("editor-errors")).textContent).toContain("Name is already taken");
    expect(field("field-name").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByTestId("error-name").textContent).toContain("Name is already taken");
    expect(callsTo(backend, "save_hosts")).toHaveLength(0);
  });

  it("flags port 70000 and an unparsable tunnel", async () => {
    overlay();
    fireEvent.change(field("field-port"), { target: { value: "70000" } });
    await click("editor-save");
    expect((await screen.findByTestId("error-port")).textContent).toContain("1 and 65535");
    expect((await screen.findByTestId("editor-errors")).textContent).toContain("Port must be between 1 and 65535");

    // A tunnel part outside the port range stays visible as an editable row.
    fireEvent.change(field("field-port"), { target: { value: "22" } });
    await click("tunnel-add");
    expect(screen.getByTestId("tunnel-type-0")).toBeInTheDocument();
    fireEvent.change(field("tunnel-source-0"), { target: { value: "70000" } });
    expect(screen.getByTestId("tunnel-raw-0")).toBeInTheDocument();
    await click("editor-save");
    expect((await screen.findByTestId("editor-errors")).textContent).toContain("-L 8080:localhost:80");
  });

  it("edits in place and keeps the tunnel string round-trippable", async () => {
    overlay(() => editHost(host("item10", { host: "127.0.0.1", port: 2222, tunnels: "-L 8080:localhost:80" })));
    fireEvent.change(field("field-port"), { target: { value: "2200" } });
    fireEvent.change(field("tunnel-source-0"), { target: { value: "9090" } });
    await click("editor-save");
    expect(savedHosts().find((h) => h.name === "item10")).toMatchObject({
      port: 2200,
      tunnels: "-L 9090:localhost:80",
    });
  });

  it("the ssh_config preview is live and a hand-added line survives", async () => {
    overlay();
    fireEvent.change(field("field-name"), { target: { value: "web-1" } });
    fireEvent.change(field("field-host"), { target: { value: "10.0.0.7" } });
    fireEvent.change(field("field-port"), { target: { value: "2200" } });
    const block = () => screen.getByTestId("field-ssh-config") as HTMLTextAreaElement;
    expect(block().value).toContain("Host web-1");
    fireEvent.change(block(), { target: { value: `${block().value}\n    ForwardAgent yes` } });
    fireEvent.change(field("field-host"), { target: { value: "10.0.0.8" } });
    expect(block().value.split("\n")).toEqual([
      "Host web-1",
      "    HostName 10.0.0.8",
      "    Port 2200",
      "    ForwardAgent yes",
    ]);
    await click("editor-save");
    expect(savedHosts()[savedHosts().length - 1]?.ssh_config).toContain("ForwardAgent yes");
  });

  it("account selection shows the account credentials and disables the host fields", () => {
    overlay(() => editHost(host("item2", { account: "lab-key" })));
    expect(field("field-username").value).toBe("keyuser");
    expect(field("field-username").disabled).toBe(true);
    fireEvent.change(screen.getByTestId("field-account"), { target: { value: "" } });
    expect(field("field-username").disabled).toBe(false);
  });

  it("an OS error toasts the OS message and reverts the list (task 3.12)", async () => {
    overlay();
    backend.failNext("save_hosts", "hosts.json: Read-only file system (os error 30)");
    fireEvent.change(field("field-name"), { target: { value: "ro" } });
    fireEvent.change(field("field-host"), { target: { value: "1.2.3.4" } });
    await click("editor-save");
    expect((await screen.findByTestId("toast")).textContent).toContain("Read-only file system");
    await waitFor(() => expect(useAppStore.getState().hosts.map((h) => h.name)).not.toContain("ro"));
  });
});

describe("duplicate + remove (tasks 3.7, 3.8, 3.11)", () => {
  it("duplicate opens a copy in add mode with the -copy suffix", async () => {
    overlay(() => duplicateHostAction(host("web-1", { host: "h" })));
    expect(screen.getByTestId("editor-title").textContent).toBe("New Connection");
    expect(field("field-name").value).toBe("web-1-copy");
    await click("editor-save");
    expect(savedHosts().map((h) => h.name)).toContain("web-1-copy");
  });

  it("duplicating an existing copy yields -copy-2", () => {
    useAppStore.setState({ hosts: [...useAppStore.getState().hosts, host("web-1-copy", { host: "h" })] });
    overlay(() => duplicateHostAction(host("web-1-copy", { host: "h" })));
    expect(field("field-name").value).toBe("web-1-copy-2");
  });

  it('Remove asks "Remove <name>?" then drops the host and the selection', async () => {
    useAppStore.getState().selectHost("item10");
    overlay(() => removeHost(host("item10", { host: "h" })));
    expect((await screen.findByTestId("confirm-dialog")).textContent).toContain("Remove item10?");
    await click("confirm-ok");
    expect(savedHosts().map((h) => h.name)).toEqual(["Localhost", "item2"]);
    expect(useAppStore.getState().selectedHostId).toBeNull();
  });

  it("Cancel in the confirm leaves the library untouched", async () => {
    overlay(() => removeHost(host("item10", { host: "h" })));
    await screen.findByTestId("confirm-dialog");
    await click("confirm-cancel");
    await waitFor(() => expect(screen.queryByTestId("confirm-dialog")).toBeNull());
    expect(callsTo(backend, "save_hosts")).toHaveLength(0);
  });

  it("Escape means Cancel and focus returns to the opener", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    overlay(() => removeHost(host("item10", { host: "h" })));
    const dialog = await screen.findByTestId("confirm-dialog");
    expect(dialog.contains(document.activeElement)).toBe(true); // focus moved in
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("confirm-dialog")).toBeNull());
    expect(document.activeElement).toBe(opener);
  });
});

describe("AccountEditor (task 3.9, R2)", () => {
  it("renaming + editing credentials propagates to linked hosts", async () => {
    overlay(() => editAccount(labKey));
    fireEvent.change(field("field-username"), { target: { value: "keyuser2" } });
    await click("editor-save");
    expect(savedAccounts()[0]).toMatchObject({ id: "a1", username: "keyuser2" });
    expect(savedHosts().find((h) => h.name === "item2")).toMatchObject({
      account: "lab-key",
      username: "keyuser2",
      password: "pw",
    });
  });

  it("renaming the account re-points its hosts", async () => {
    overlay(() => editAccount(labKey));
    fireEvent.change(field("field-name"), { target: { value: "lab" } });
    await click("editor-save");
    expect(savedHosts().find((h) => h.name === "item2")?.account).toBe("lab");
    expect(savedAccounts()[0]?.name).toBe("lab");
  });

  it("deleting an account in use asks with the right count and unlinks", async () => {
    overlay(() => removeAccountAction(labKey));
    expect((await screen.findByTestId("confirm-dialog")).textContent).toContain("1 host uses this account");
    await click("confirm-ok");
    expect(savedAccounts()).toHaveLength(0);
    expect(savedHosts().find((h) => h.name === "item2")).toMatchObject({ account: "", username: "keyuser" });
  });

  it("requires a unique name", async () => {
    const other: Account = { ...labKey, id: "a2", name: "lab-2" };
    useAppStore.setState({ accounts: [labKey, other] });
    overlay(() => editAccount(other));
    fireEvent.change(field("field-name"), { target: { value: "lab-key" } });
    await click("editor-save");
    expect((await screen.findByTestId("editor-errors")).textContent).toContain("Name is already taken");
    expect(callsTo(backend, "save_accounts")).toHaveLength(0);
  });

  it("New Account opens an empty editor and saves a fresh record", async () => {
    overlay(addAccount);
    expect(screen.getByTestId("editor-title").textContent).toBe("New Account");
    fireEvent.change(field("field-name"), { target: { value: "ci-key" } });
    fireEvent.change(field("field-username"), { target: { value: "ci" } });
    await click("editor-save");
    expect(savedAccounts().map((a) => a.name)).toEqual(["lab-key", "ci-key"]);
  });

  it("duplicating an account gives lab-key-copy", () => {
    overlay(() => duplicateAccountAction(labKey));
    expect(field("field-name").value).toBe("lab-key-copy");
    expect(screen.getByTestId("editor-title").textContent).toBe("New Account");
  });
});
