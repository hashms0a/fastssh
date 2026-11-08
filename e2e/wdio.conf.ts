import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const T = process.env.FASTSSH_TESTENV ?? path.join(os.homedir(), "fastssh-testenv");
/** The binary e2e launches; resolved so onPrepare can kill leftovers of it. */
const APP = process.env.E2E_APP ?? "./src-tauri/target/debug/fastssh";
/** Absolute and as-written: tauri-driver may exec either form. */
const APP_PATTERNS = [path.resolve(APP), APP];

/**
 * Kill what an aborted run left behind: app instances and driver processes.
 * reloadSession deletes the driver session but leaves the app running, and
 * tauri-driver attaches to any window of this binary, so a leftover instance
 * makes tests race against an app nobody controls. A leftover tauri-driver
 * keeps the default port and the new run talks to it instead of its own
 * driver. Only the e2e binary and these two drivers are matched.
 */
function killLeftovers(): void {
  const patterns = fs.existsSync(path.resolve(APP)) ? [...APP_PATTERNS, "tauri-driver", "WebKitWebDriver"] : [];
  for (const pattern of patterns) {
    try {
      execFileSync("pkill", ["-f", pattern], { stdio: "ignore" });
    } catch {
      /* pkill exits 1 when nothing matched — that is the normal case */
    }
  }
}
// The app under test inherits these, so every run uses the sandbox files.
process.env.FASTSSH_CONFIG_DIR ??= path.join(T, "config");
process.env.FASTSSH_SSH_DIR ??= path.join(T, "ssh");
process.env.FASTSSH_LEGACY_DIR ??= path.join(T, "legacy");

export const config: WebdriverIO.Config = {
  specs: ["./specs/**/*.e2e.ts"],
  maxInstances: 1,
  services: [
    [
      "@wdio/tauri-service",
      {
        // Use tauri-driver + WebKitWebDriver (both installed in Stage 0A)
        // instead of the embedded provider (which needs tauri-plugin-wdio).
        driverProvider: "external",
      },
    ],
  ],
  capabilities: [
    {
      browserName: "tauri",
      "tauri:options": {
        // e2e always runs the DEBUG binary built by tools/build-debug.sh.
        application: process.env.E2E_APP ?? "./src-tauri/target/debug/fastssh",
      },
    } as WebdriverIO.Capabilities,
  ],
  framework: "mocha",
  reporters: ["spec"],
  onPrepare: () => {
    killLeftovers();
    // Give the killed processes a moment so the new instance is the only one.
    execFileSync("sleep", ["1"], { stdio: "ignore" });
  },
  waitforTimeout: 5000,
  // The tauri driver's window-focus hook intermittently fails with CDP 404s;
  // one retry absorbs it without hiding real regressions.
  mochaOpts: { timeout: 120000, bail: true, retries: Number(process.env.E2E_RETRIES ?? 1) },
};
