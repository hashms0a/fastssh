import { describe, expect, it } from "vitest";
import type { Account, Host } from "../types/models";
import { newHost } from "./hostUtils";
import { blockValue, browserTarget } from "./sftpTarget";

const ACCOUNTS: Account[] = [{ id: "a1", name: "lab-key", username: "keyuser", password: "p", identity_file: "" }];

const host = (over: Partial<Host>): Host =>
  newHost({ name: "web1", host: "10.0.0.1", port: 22, username: "ops", ...over });

describe("blockValue", () => {
  it("reads a plain key/value line", () => {
    expect(blockValue("Host web1\n    HostName real.example.com\n    Port 2200", "HostName")).toBe("real.example.com");
    expect(blockValue("Host web1\n  Port 2200", "port"), "the key match is case-insensitive").toBe("2200");
  });

  it("reads the Key=value form and an unquoted value", () => {
    expect(blockValue("HostName=10.0.0.10", "HostName")).toBe("10.0.0.10");
    expect(blockValue('User "dev ali"', "User")).toBe("dev ali");
  });

  it("skips comments and returns null for an absent or empty key", () => {
    expect(blockValue("# HostName nope\nUser real", "HostName")).toBeNull();
    expect(blockValue("Host web1\n    User", "User")).toBeNull();
    expect(blockValue("", "User")).toBeNull();
  });

  it("takes the first line, as ssh does", () => {
    expect(blockValue("User first\nUser second", "User")).toBe("first");
  });
});

describe("browserTarget (R16 target resolution)", () => {
  it("uses the host's own fields when sync is off", () => {
    expect(browserTarget(host({}), ACCOUNTS, false)).toEqual({ user: "ops", host: "10.0.0.1", port: 22 });
  });

  it("uses the linked account's username (R2)", () => {
    expect(browserTarget(host({ account: "lab-key" }), ACCOUNTS, false)).toEqual({
      user: "keyuser",
      host: "10.0.0.1",
      port: 22,
    });
  });

  it("in sync mode takes HostName, Port and User from the ssh_config block (task 7.4)", () => {
    const h = host({
      host: "web1",
      port: 22,
      ssh_config: "Host web1\n    HostName 127.0.0.1\n    Port 2222\n    User keyuser",
    });
    expect(browserTarget(h, ACCOUNTS, true)).toEqual({ user: "keyuser", host: "127.0.0.1", port: 2222 });
  });

  it("falls back to the record's fields for keys the block does not set", () => {
    const h = host({ ssh_config: "Host web1\n    HostName 192.0.2.5" });
    expect(browserTarget(h, ACCOUNTS, true)).toEqual({ user: "ops", host: "192.0.2.5", port: 22 });
  });

  it("ignores a malformed Port in the block", () => {
    const h = host({ port: 2222, ssh_config: "Host web1\n    Port abc" });
    expect(browserTarget(h, ACCOUNTS, true).port).toBe(2222);
  });

  it("keeps the record's fields when sync is on but the block is empty", () => {
    const h = host({ ssh_config: "   " });
    expect(browserTarget(h, ACCOUNTS, true)).toEqual({ user: "ops", host: "10.0.0.1", port: 22 });
  });
});
