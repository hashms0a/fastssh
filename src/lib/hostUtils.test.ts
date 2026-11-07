import { describe, expect, it } from "vitest";
import {
  accountNameTaken,
  applyAccountToHosts,
  duplicateAccount,
  duplicateHost,
  duplicateName,
  errorsFor,
  hostsUsingAccount,
  newAccount,
  newHost,
  normalizeName,
  resolveCredentials,
  unlinkHostsFromAccount,
  validateHost,
} from "./hostUtils";
import type { Account, Host } from "../types/models";

const host = (name: string, over: Partial<Host> = {}): Host => newHost({ id: name, name, host: "127.0.0.1", ...over });

const account = (name: string, over: Partial<Account> = {}): Account =>
  newAccount({ id: name, name, username: "keyuser", password: "pw", identity_file: "~/.ssh/id_ed25519", ...over });

const keys = (h: Host, hosts: Host[], id: string | null = null) => validateHost(h, hosts, id).map((e) => e.messageKey);

describe("normalizeName (task 3.1)", () => {
  it("trims and collapses whitespace runs into a single dash", () => {
    expect(normalizeName("  web 1  ")).toBe("web-1");
    expect(normalizeName("my\tserver  x")).toBe("my-server-x");
    expect(normalizeName("")).toBe("");
  });
});

describe("validateHost (task 3.1)", () => {
  it("requires a name and the host, and a 1-65535 port", () => {
    const hosts = [host("web-1")];
    expect(keys(host("web-1"), hosts, "web-1")).toEqual([]);
    expect(keys(host("", { host: "" }), hosts)).toEqual(["nameRequired", "hostRequired"]);
    expect(keys(host("web-1", { port: 70000 }), hosts, "web-1")).toEqual(["portRange"]);
    expect(keys(host("web-1", { port: 0 }), hosts, "web-1")).toEqual(["portRange"]);
  });

  it("name uniqueness is case-sensitive (like ssh) and ignores the edited host", () => {
    const hosts = [host("Web-1"), host("other")];
    expect(keys(host("web-1"), hosts)).toEqual([]);
    expect(keys(host("Web-1"), hosts, "other")).toEqual(["nameTaken"]);
    expect(keys(host("Web-1"), hosts, "Web-1")).toEqual([]);
  });

  it("rejects the characters ssh config dislikes", () => {
    const hosts = [host("web-1", { name: 'a*b?!#,"x' })];
    expect(keys(hosts[0]!, hosts, "web-1")).toEqual(["nameChars"]);
  });

  it("reports an invalid tunnel list", () => {
    const hosts = [host("web-1", { tunnels: "-L abc" })];
    const errs = validateHost(hosts[0]!, hosts, "web-1");
    expect(errorsFor(errs, "tunnels").map((e) => e.messageKey)).toEqual(["tunnelsInvalid"]);
  });
});

describe("resolveCredentials (task 3.1, R2)", () => {
  const accounts = [account("lab-key", { username: "keyuser2" })];

  it("uses the account when the link resolves", () => {
    expect(resolveCredentials(host("item2", { account: "lab-key", username: "own" }), accounts)).toEqual({
      username: "keyuser2",
      password: "pw",
      identity_file: "~/.ssh/id_ed25519",
    });
  });

  it("falls back to the host's own values for no/unknown account", () => {
    const own = host("item10", { account: "", username: "tester", password: "p", identity_file: "~/.ssh/id" });
    expect(resolveCredentials(own, accounts)).toEqual({
      username: "tester",
      password: "p",
      identity_file: "~/.ssh/id",
    });
    expect(resolveCredentials(host("x", { account: "ghost", username: "u" }), accounts).username).toBe("u");
  });
});

describe("duplicateName / duplicate* (task 3.7)", () => {
  it("grows the -copy suffix until the name is free", () => {
    expect(duplicateName("web-1", ["web-1"])).toBe("web-1-copy");
    expect(duplicateName("web-1-copy", ["web-1", "web-1-copy"])).toBe("web-1-copy-2");
    expect(duplicateName("web-1-copy-2", ["web-1-copy", "web-1-copy-2"])).toBe("web-1-copy-3");
  });

  it("copies every field with a new id", () => {
    const src = host("web-1", { group: "Lab", port: 2222, tunnels: "-L 1:two:3" });
    const copy = duplicateHost(src, [src]);
    expect(copy).toEqual({ ...src, id: copy.id, name: "web-1-copy", local: undefined });
  });

  it("duplicates accounts too", () => {
    const src = account("lab-key");
    expect(duplicateAccount(src, [src]).name).toBe("lab-key-copy");
  });
});

describe("account links (task 3.9, R2)", () => {
  it("reports and counts the hosts using an account", () => {
    const hosts = [host("item2", { account: "lab-key" }), host("web-1")];
    expect(hostsUsingAccount(hosts, "lab-key").map((h) => h.name)).toEqual(["item2"]);
    expect(hostsUsingAccount(hosts, "")).toEqual([]);
    expect(accountNameTaken("lab-key", [account("lab-key")], "a1")).toBe(true);
    expect(accountNameTaken("lab-key", [account("lab-key")], "lab-key")).toBe(false);
  });

  it("propagates a rename plus credentials to linked hosts only", () => {
    const hosts = [host("item2", { account: "lab-key" }), host("item10", { account: "", username: "tester" })];
    const { list, changed } = applyAccountToHosts(hosts, "lab-key", account("lab", { username: "keyuser2" }));
    expect(changed).toBe(1);
    expect(list[0]).toMatchObject({ name: "item2", account: "lab", username: "keyuser2", password: "pw" });
    expect(list[1]).toBe(hosts[1]);
  });

  it("unlinking keeps credentials and clears the link", () => {
    const hosts = [host("item2", { account: "lab-key", username: "keyuser" })];
    expect(unlinkHostsFromAccount(hosts, "lab-key")[0]).toMatchObject({ account: "", username: "keyuser" });
  });
});
