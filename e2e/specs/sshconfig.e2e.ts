import { execSync } from "node:child_process";
import { expect } from "@wdio/globals";
import {
  byTestId,
  clickInPage,
  clickRow,
  connectRow,
  expectPrompt,
  hookTabIds,
  loadFixture,
  readSshConfig,
  rowsInGroup,
  sshConfigDump,
  menuItemClick,
  sshDir,
  toastTexts,
  landingVisible,
} from "../helpers";

/**
 * Stage 9 acceptance (R7): enabling Sync in Preferences backs the config up,
 * imports its concrete Host blocks into the "SSHConfig" group, and from then
 * on every host save rewrites the file atomically while the user's global,
 * wildcard and Match blocks survive.
 *
 * Everything runs against FASTSSH_SSH_DIR = ~/fastssh-testenv/ssh (tools/
 * dev-sandbox.sh and e2e/wdio.conf.ts set it), so the owner's ~/.ssh is never
 * touched - verify.sh's "real files" guard proves that.
 *
 * Order matters: test 1 turns sync on and leaves the sandbox that way; tests 2
 * and 3 restart the app on that state (browser.reloadSession, no resetSandbox,
 * because a reset would rebuild the fixtures and clear settings.json).
 */

const MANAGED_HEAD = "# >>> FastSSH managed hosts (edits here are overwritten) >>>";
const MANAGED_END = "# <<< FastSSH managed hosts <<<";

/** Open Preferences through the header menu. */
async function openPreferences(): Promise<void> {
  await clickInPage("header-menu");
  await menuItemClick("header-menu-list", "Preferences");
  await (await byTestId("preferences-modal")).waitForExist({ timeout: 5000 });
}

async function closePreferences(): Promise<void> {
  await clickInPage("prefs-close");
  await browser.waitUntil(async () => !(await (await byTestId("preferences-modal")).isExisting()), { timeout: 5000 });
}

/** Replace a field's text (the editor keeps its own controlled inputs). */
async function setField(testId: string, value: string): Promise<void> {
  await (await byTestId(testId)).waitForExist({ timeout: 5000 });
  await browser.execute((id) => {
    const el = document.querySelector<HTMLInputElement>(`[data-testid="${id}"]`);
    if (!el) return;
    el.focus();
    el.select();
  }, testId);
  await browser.pause(150);
  for (const ch of value) {
    await browser.keys([ch]);
    await browser.pause(60);
  }
}

async function editHostPort(name: string, port: string): Promise<void> {
  await clickRow(name);
  await clickInPage("landing-edit");
  await (await byTestId("connection-editor")).waitForExist({ timeout: 6000 });
  await setField("field-port", port);
  await clickInPage("editor-save");
  await browser.waitUntil(async () => !(await (await byTestId("connection-editor")).isExisting()), { timeout: 8000 });
}

describe("two-way ~/.ssh/config sync (Stage 9)", () => {
  before(async () => {
    await loadFixture("sshconfig");
  });

  // 1. R7: enable Sync -> backup, import, managed section, the group in the UI.
  it("enabling Sync asks first, then imports the config hosts and writes the managed section", async () => {
    const original = readSshConfig();
    expect(original).toContain("Host web1 web-alias");

    await openPreferences();
    await clickInPage("prefs-sync-config");
    await (await byTestId("confirm-dialog")).waitForExist({ timeout: 5000 });
    const message = await (await byTestId("confirm-message")).getText();
    expect(message).toContain(`${sshDir}/config`);
    expect(message).toContain(`${sshDir}/config.backup`);
    expect(message).toMatch(/Wildcard and Match blocks are kept/);
    await clickInPage("confirm-ok");

    await browser.waitUntil(async () => (await toastTexts()).some((t) => /Imported 5 hosts \(0 skipped\)/.test(t)), {
      timeout: 12000,
      interval: 400,
    });
    await closePreferences();

    // The five concrete patterns became hosts; the aliases are hosts too.
    const rows = await rowsInGroup("SSHConfig");
    expect(rows.sort()).toEqual(["bastion", "db10", "db2", "web-alias", "web1"]);

    const text = readSshConfig();
    expect(text).toContain("ServerAliveInterval 30");
    expect(text.indexOf("ServerAliveInterval 30")).toBeLessThan(text.indexOf(MANAGED_HEAD));
    expect(text).toContain(MANAGED_HEAD);
    expect(text).toContain(MANAGED_END);
    // ssh takes the first match, so the managed hosts must preced "Host *".
    expect(text.indexOf(MANAGED_END)).toBeLessThan(text.indexOf("Host *"));
    expect(text).toContain("Host !negated *.corp");
    expect(text).toContain("Match host *.internal");
    expect(text).toContain("Include conf.d/*");
    expect(text).toContain("    ServerAliveCountMax 3");
    expect(text).toContain("Host web1");
    expect(text).toContain("    Port 2222");
    expect(text).not.toContain("fastssh-test-pass");

    // The original file is preserved byte-for-byte next to it.
    const backup = execSync(`cat '${sshDir}/config.backup'`, { encoding: "utf8" });
    expect(backup).toBe(original);
  });

  // 2. R7/R1: a host edit rewrites only its own block, and ssh reads it.
  it("editing db2's port rewrites its block, and ssh -G db2 reports port 2200", async () => {
    await browser.reloadSession();
    await (await byTestId("header-bar")).waitForExist();
    expect(sshConfigDump("db2")).toMatch(/^hostname 10.0.0.2$/m);
    expect(sshConfigDump("db2")).toMatch(/^port 22$/m);

    await editHostPort("db2", "2200");

    const text = readSshConfig();
    const at = text.split("\n").findIndex((l) => l.trim() === "Host db2");
    expect(at).toBeGreaterThan(-1);
    const block = text
      .split("\n")
      .slice(at, at + 4)
      .join("\n");
    expect(block).toContain("    Port 2200");
    expect(block).toContain("HostName 10.0.0.2");
    expect(text).toContain("    Port 2222");

    expect(sshConfigDump("db2")).toMatch(/^port 2200$/m);
    expect(sshConfigDump("db2")).toMatch(/^hostname 10.0.0.2$/m);
    expect(sshConfigDump("web1")).toMatch(/^port 2222$/m);
    expect(sshConfigDump("web1")).toMatch(/^user keyuser$/m);
  });

  // 3. R9 sync mode: ssh reads the config, so the name is enough.
  it("connecting web1 runs ssh -F <sandbox>/config web1 and logs in with the key", async () => {
    await browser.reloadSession();
    await (await byTestId("header-bar")).waitForExist();

    const tab = await connectRow("web1");
    if (await (await byTestId("fingerprint-modal")).isExisting()) {
      await clickInPage("fingerprint-yes");
    }
    await expectPrompt(tab, "keyuser");

    const ps = execSync("ps -eo args", { encoding: "utf8" });
    const lines = ps.split("\n").filter((l) => /\bssh -F\b/.test(l));
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((l) => l.includes("web1"))).toBe(true);
    expect(lines.some((l) => l.includes("-p 2222"))).toBe(false); // sync mode passes no -p
    expect(lines.some((l) => l.includes(sshDir))).toBe(true);
    expect(lines.some((l) => l.includes("UserKnownHostsFile"))).toBe(true);

    // The tab belongs to the imported host, and the landing card is gone.
    expect(await hookTabIds()).toContain(tab);
    expect(await landingVisible()).toBe(false);
  });
});
