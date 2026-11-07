import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const T = process.env.FASTSSH_TESTENV ?? path.join(os.homedir(), "fastssh-testenv");
/** The sandbox config dir the app under test uses (helpers.ts sets the env). */
export const configDir = process.env.FASTSSH_CONFIG_DIR ?? path.join(T, "config");

/** Save a screenshot into docs/screenshots/<stage>/<name>.png */
export async function shot(stageDir: string, name: string): Promise<void> {
  const file = path.join(__dirname, "..", "docs", "screenshots", stageDir, name);
  await browser.saveScreenshot(file);
}

export const byTestId = (id: string) => $(`[data-testid="${id}"]`);

/** The fixture sets of Section 10 step 6. */
export type FixtureSet = "empty" | "legacy" | "big" | "bad" | "sshconfig";

const SET_FILES: Record<FixtureSet, string[]> = {
  empty: [],
  legacy: ["legacy/hosts.json", "legacy/accounts.json", "legacy/bookmarks.json"],
  big: ["big/hosts.json", "legacy/accounts.json", "legacy/bookmarks.json"],
  bad: ["bad/hosts.json", "bad/accounts.json", "bad/bookmarks.json", "bad/settings.json"],
  sshconfig: ["legacy/hosts.json", "legacy/accounts.json", "legacy/bookmarks.json"],
};

/** Empties the sandbox config dir and copies in one fixture set. */
export function resetSandbox(set: FixtureSet = "legacy"): void {
  fs.rmSync(configDir, { recursive: true, force: true });
  fs.mkdirSync(configDir, { recursive: true });
  for (const rel of SET_FILES[set]) {
    const src = path.join(T, rel);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(configDir, path.basename(rel)));
  }
  if (set === "sshconfig") {
    const src = path.join(T, "ssh", "config");
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(configDir, "ssh_config"));
  }
}

/** Fresh sandbox data, then restart the app so it loads it. */
export async function loadFixture(set: FixtureSet = "legacy"): Promise<void> {
  resetSandbox(set);
  await browser.reloadSession();
  await (await byTestId("header-bar")).waitForExist();
}
