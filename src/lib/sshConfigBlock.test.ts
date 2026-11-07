import { describe, expect, it } from "vitest";
import { blockForHost, syncBlock } from "./sshConfigBlock";
import type { BlockFields } from "./sshConfigBlock";
import { newHost } from "./hostUtils";

const fields = (over: Partial<BlockFields> = {}): BlockFields => ({
  name: "web-1",
  host: "127.0.0.1",
  port: 2222,
  username: "tester",
  identityFile: "",
  forwards: [],
  ...over,
});

describe("syncBlock (task 3.3)", () => {
  it("generates the managed lines from an empty block", () => {
    expect(syncBlock("", fields())).toBe(
      ["Host web-1", "    HostName 127.0.0.1", "    User tester", "    Port 2222"].join("\n"),
    );
  });

  it("rewrites only the managed lines and keeps comments and user lines in place", () => {
    const block = [
      "# my laptop box",
      "Host old-name",
      "    HostName 10.0.0.1",
      "    ForwardAgent yes",
      "    IdentityFile ~/.ssh/id_old",
      "    ServerAliveInterval 30",
    ].join("\n");
    const out = syncBlock(block, fields({ name: "web-2", host: "127.0.0.1", identityFile: "~/.ssh/id_new" }));
    expect(out.split("\n")).toEqual([
      "Host web-2",
      "    HostName 127.0.0.1",
      "    User tester",
      "    Port 2222",
      "    IdentityFile ~/.ssh/id_new",
      "# my laptop box",
      "    ForwardAgent yes",
      "    ServerAliveInterval 30",
    ]);
  });

  it("keys match case-insensitively and the = form is managed too", () => {
    const out = syncBlock("HOST box\n    UserName=root\n    PORT=2200\n", fields({ port: 22 }));
    expect(out).toBe("Host web-1\n    HostName 127.0.0.1\n    User tester\n    Port 22\n    UserName=root");
  });

  it("an empty value removes the line (Host always stays)", () => {
    const out = syncBlock(
      "Host box\n    HostName h\n    User u\n    IdentityFile ~/.ssh/id\n",
      fields({ username: "", identityFile: "" }),
    );
    expect(out).toBe("Host web-1\n    HostName 127.0.0.1\n    Port 2222");
    expect(syncBlock("Host box", fields({ host: "", username: "" }))).toBe("Host web-1\n    Port 2222");
  });

  it("manages the forwards as a group", () => {
    const block = "Host box\n    LocalForward 1111 a:22\n    ForwardX11 yes\n    RemoteForward 4444 b:80\n";
    const out = syncBlock(block, fields({ forwards: ["LocalForward 8080 localhost:80"] }));
    expect(out.split("\n")).toEqual([
      "Host web-1",
      "    HostName 127.0.0.1",
      "    User tester",
      "    Port 2222",
      "    LocalForward 8080 localhost:80",
      "    ForwardX11 yes",
    ]);
  });

  it("quotes a value with spaces", () => {
    expect(syncBlock("", fields({ identityFile: "/home/me/my key" }))).toContain('IdentityFile "/home/me/my key"');
  });

  it("a hand-added ForwardAgent line survives 10 edits of the name", () => {
    let block = syncBlock("", fields());
    block = syncBlock(`${block}\n    ForwardAgent yes`, fields());
    for (let i = 0; i < 10; i += 1) block = syncBlock(block, fields({ name: `web-${i}` }));
    expect(block.split("\n").filter((l) => l.includes("ForwardAgent"))).toEqual(["    ForwardAgent yes"]);
    expect(block.split("\n").filter((l) => l.trim().startsWith("Host "))).toEqual(["Host web-9"]);
  });
});

describe("blockForHost (editor preview)", () => {
  it("uses the draft's fields and tunnels", () => {
    const host = newHost({
      name: "web 1",
      host: "127.0.0.1",
      port: 2222,
      username: "tester",
      tunnels: "-L 8080:localhost:80,-R 9000:db:5432",
      ssh_config: "    ProxyJump bastion",
    });
    expect(blockForHost(host)).toBe(
      [
        "Host web 1",
        "    HostName 127.0.0.1",
        "    User tester",
        "    Port 2222",
        "    LocalForward 8080 localhost:80",
        "    RemoteForward 9000 db:5432",
        "    ProxyJump bastion",
      ].join("\n"),
    );
  });
});
