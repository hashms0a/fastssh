import os from "node:os";
import path from "node:path";
import type { WebdriverIO } from "webdriverio";

const T = process.env.FASTSSH_TESTENV ?? path.join(os.homedir(), "fastssh-testenv");
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
  waitforTimeout: 5000,
  // The tauri driver's window-focus hook intermittently fails with CDP 404s;
  // one retry absorbs it without hiding real regressions.
  mochaOpts: { timeout: 30000, bail: true, retries: 1 },
};
