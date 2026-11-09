import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Read from disk, not through Vite, like src/themeContrast.test.ts does. */
const read = (path: string): string => readFileSync(join(process.cwd(), path), "utf8");

/**
 * The About dialog and the workspace status bar both print the version the
 * Rust side reports (`env!("CARGO_PKG_VERSION")` in
 * src-tauri/src/commands/system.rs), so src-tauri/Cargo.toml is the number the
 * user sees. tauri.conf.json names the AppImage file and package.json drives
 * npm; when they drift, the shipped file and the window disagree (that is how
 * an AppImage ended up showing a version the repo no longer had).
 */
function cargoVersion(): string {
  const match = /^version = "([^"]+)"/m.exec(read("src-tauri/Cargo.toml"));
  if (!match?.[1]) throw new Error("no version in src-tauri/Cargo.toml");
  return match[1];
}

describe("release version", () => {
  const version = cargoVersion();

  it(`${version} matches package.json, package-lock.json and tauri.conf.json`, () => {
    expect(JSON.parse(read("package.json")).version).toBe(version);
    expect(JSON.parse(read("package-lock.json")).version).toBe(version);
    expect(JSON.parse(read("package-lock.json")).packages[""].version).toBe(version);
    expect(JSON.parse(read("src-tauri/tauri.conf.json")).version).toBe(version);
  });

  it("matches the fastssh entry in Cargo.lock", () => {
    expect(read("src-tauri/Cargo.lock")).toContain(`name = "fastssh"\nversion = "${version}"`);
  });

  it("is derived, not hardcoded, in the AppImage scripts", () => {
    for (const path of ["tools/build-appimage-jammy.sh", "tools/dev-sandbox.sh"]) {
      expect(read(path), path).not.toMatch(/FastSSH_\d+\.\d+\.\d+_amd64\.AppImage/);
    }
  });
});
