import { describe, expect, it } from "vitest";
import { emptyTunnel, parseTunnel, parseTunnels, serializeTunnel, serializeTunnels, tunnelForwards } from "./tunnels";

describe("parseTunnels (task 3.2)", () => {
  it("parses the EasySSH list, in order", () => {
    const { rules, errors } = parseTunnels("-L 8080:localhost:80,-R 9000:db:5432");
    expect(errors).toEqual([]);
    expect(rules).toHaveLength(2);
    expect(rules[0]).toMatchObject({
      type: "local",
      sourcePort: 8080,
      destinationHost: "localhost",
      destinationPort: 80,
    });
    expect(rules[1]).toMatchObject({ type: "remote", sourcePort: 9000, destinationHost: "db", destinationPort: 5432 });
  });

  it("accepts -L8080:... with no space, lowercase flags and a bare port", () => {
    expect(parseTunnel("-L8080:localhost:80")).toMatchObject({ type: "local", sourcePort: 8080, destinationPort: 80 });
    expect(parseTunnel("-l2222:db:22")).toMatchObject({ type: "local", sourcePort: 2222 });
    expect(parseTunnel("3000:app:3000")).toMatchObject({ type: "local", sourcePort: 3000, destinationHost: "app" });
  });

  it("keeps an IPv6 destination with its brackets", () => {
    const r = parseTunnel("-L 8080:[::1]:22");
    expect(r).toMatchObject({ destinationHost: "[::1]", sourcePort: 8080, destinationPort: 22 });
  });

  it("builds a fresh editable rule", () => {
    expect(emptyTunnel()).toMatchObject({
      type: "local",
      sourcePort: 8080,
      destinationHost: "localhost",
      destinationPort: 80,
    });
    expect(emptyTunnel().id).not.toBe(emptyTunnel().id);
  });

  it("reports invalid parts, never drops them silently", () => {
    const { rules, errors } = parseTunnels("-L abc, -R 1:2:3, -L 70000:h:22, -R 80:h");
    expect(rules.map((r) => r.sourcePort)).toEqual([1]);
    expect(errors).toEqual(["-L abc", "-L 70000:h:22", "-R 80:h"]);
  });

  it("treats an empty string as no rules and no errors", () => {
    expect(parseTunnels("")).toEqual({ rules: [], errors: [] });
    expect(parseTunnels("  ,  ")).toEqual({ rules: [], errors: [] });
  });
});

describe("serializeTunnels (task 3.2)", () => {
  it("round-trips a normalized list", () => {
    const text = "-L 8080:localhost:80,-R 9000:db:5432";
    expect(serializeTunnels(parseTunnels(text).rules)).toBe(text);
  });

  it('normalizes the no-space form to "-L port:host:port"', () => {
    expect(serializeTunnel(parseTunnel("-L8080:localhost:80")!)).toBe("-L 8080:localhost:80");
  });

  it("round-trips an IPv6 destination", () => {
    const rules = parseTunnels("-R 9000:[::1]:5432").rules;
    expect(serializeTunnels(rules)).toBe("-R 9000:[::1]:5432");
    expect(serializeTunnels(parseTunnels(serializeTunnels(rules)).rules)).toBe("-R 9000:[::1]:5432");
  });

  it("serializes an empty rule list to the empty string", () => {
    expect(serializeTunnels([])).toBe("");
  });
});

describe("tunnelForwards (task 3.3 feed)", () => {
  it("maps rules to ssh_config forward lines", () => {
    expect(tunnelForwards("-L 8080:localhost:80,-R 9000:db:5432")).toEqual([
      "LocalForward 8080 localhost:80",
      "RemoteForward 9000 db:5432",
    ]);
  });

  it("skips invalid parts (validation reports them separately)", () => {
    expect(tunnelForwards("-L abc,-L 1:h:2")).toEqual(["LocalForward 1 h:2"]);
  });
});
