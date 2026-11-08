import { expect } from "@wdio/globals";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  byTestId,
  clickInPage,
  configDir,
  configExists,
  loadFixture,
  menuItemClick,
  menuItemDisabled,
  shot,
  toastTexts,
  typeInto,
} from "../helpers";

/**
 * Stage 11 (P2) acceptance: one header-menu press writes the whole library
 * into a single JSON file under `<hostsFolder>/backups/`, and "Lock library"
 * is only offered when the library is encrypted. No sshd container is needed.
 */

const backupDir = path.join(configDir, "backups");

const backups = (): string[] => (fs.existsSync(backupDir) ? fs.readdirSync(backupDir).sort() : []);

const readDoc = (name: string): Record<string, unknown> =>
  JSON.parse(fs.readFileSync(path.join(backupDir, name), "utf8")) as Record<string, unknown>;

/** Open Preferences through the header menu. */
async function openPreferences(): Promise<void> {
  await clickInPage("header-menu");
  await menuItemClick("header-menu-list", "Preferences");
  await (await byTestId("preferences-modal")).waitForExist({ timeout: 5000 });
}

async function openMenu(): Promise<void> {
  await clickInPage("header-menu");
  await (await byTestId("header-menu-list")).waitForExist({ timeout: 5000 });
}

/** Ask the app's own IPC for a backup, so the Rust guard can be asserted. */
async function invokeExport(target: string | null): Promise<{ code?: string; message?: string; path?: string }> {
  return (await browser.execute(async (p) => {
    try {
      const r = await window.__TAURI_INTERNALS__?.invoke("export_library", { path: p });
      return { path: (r as { path?: string })?.path };
    } catch (e) {
      const err = e as { code?: string; message?: string };
      return { code: err.code, message: err.message };
    }
  }, target)) as { code?: string; message?: string; path?: string };
}

describe("library backup (Stage 11, P2)", () => {
  it("Back up library writes one JSON file with all three collections", async () => {
    await loadFixture("legacy");
    await openMenu();
    await menuItemClick("header-menu-list", "Back up library");

    await browser.waitUntil(async () => backups().length === 1, { timeout: 15000, interval: 300 });
    const name = backups()[0]!;
    expect(name).toMatch(/^fastssh-library-\d{8}-\d{6}\.json$/);

    const doc = readDoc(name);
    expect(doc.app).toBe("FastSSH");
    expect(doc.schemaVersion).toBe(1);
    expect((doc.hosts as unknown[]).length).toBe(5);
    expect((doc.accounts as unknown[]).length).toBe(1);
    expect((doc.bookmarks as unknown[]).length).toBe(2);
    const hosts = doc.hosts as Array<Record<string, unknown>>;
    expect(hosts.map((h) => h.name).sort()).toEqual(["bad-port", "item10", "item2", "my-server", "Сервер-1"].sort());

    // The toast names the file the user can now find.
    await browser.waitUntil(
      async () =>
        (await toastTexts()).some(
          (t) => t.includes("Backed up 5 connections, 1 account, 2 bookmarks to ") && t.includes(name),
        ),
      { timeout: 10000, interval: 300 },
    );

    // Private modes: the folder 0700, the copy 0600.
    expect((fs.statSync(backupDir).mode & 0o777).toString(8)).toBe("700");
    expect((fs.statSync(path.join(backupDir, name)).mode & 0o777).toString(8)).toBe("600");
  });

  it("a second backup makes a second file and leaves the library files alone", async () => {
    await loadFixture("legacy");
    const before = fs.readdirSync(configDir).sort();
    await openMenu();
    await menuItemClick("header-menu-list", "Back up library");
    await browser.waitUntil(async () => backups().length === 1, { timeout: 15000, interval: 300 });
    await browser.pause(1100); // the name carries a second-resolution stamp
    await openMenu();
    await menuItemClick("header-menu-list", "Back up library");
    await browser.waitUntil(async () => backups().length === 2, { timeout: 15000, interval: 300 });
    expect(new Set(backups()).size).toBe(2);
    expect(fs.readdirSync(configDir).sort()).toEqual([...before, "backups"].sort());
  });

  it("a file the user owns at the chosen path is never overwritten", async () => {
    await loadFixture("legacy");
    const mine = path.join(configDir, "mine.json");
    fs.writeFileSync(mine, "my own file");
    const out = await invokeExport(mine);
    expect(out.code).toBe("exists");
    expect(out.message).toContain("mine.json");
    expect(fs.readFileSync(mine, "utf8")).toBe("my own file");
    fs.rmSync(mine, { force: true });
  });

  it("an encrypted library refuses the backup until it is unlocked", async () => {
    await loadFixture("locked");
    await (await byTestId("gpg-modal")).waitForExist({ timeout: 10000 });
    const out = await invokeExport(null);
    expect(out.code).toBe("locked");
    expect(backups()).toEqual([]);
  });

  it("Lock library is off-limits while encryption is off, and Back up is offered", async () => {
    await loadFixture("legacy");
    await openMenu();
    expect(await menuItemDisabled("header-menu-list", "Lock library")).toBe(true);
    expect(await menuItemDisabled("header-menu-list", "Back up library")).toBe(false);
    expect(await menuItemDisabled("header-menu-list", "Export library…")).toBe(false);
  });

  it("the backups folder lives under the hosts folder, not in $HOME", async () => {
    await loadFixture("legacy");
    await openMenu();
    await menuItemClick("header-menu-list", "Back up library");
    await browser.waitUntil(async () => backups().length === 1, { timeout: 15000, interval: 300 });
    expect(backupDir.startsWith(configDir)).toBe(true);
    expect(fs.existsSync(path.join(os.homedir(), "backups"))).toBe(false);
  });

  // Stage 10 open question 1: "Lock library now".
  it("Lock library drops the passphrase, and the unlock modal comes back", async () => {
    await loadFixture("legacy");
    await openPreferences();
    await clickInPage("prefs-encrypt");
    await (await byTestId("gpg-modal")).waitForExist({ timeout: 10000 });
    await typeInto("gpg-pass", "test-passphrase-1");
    await typeInto("gpg-pass-again", "test-passphrase-1");
    await clickInPage("gpg-submit");
    await browser.waitUntil(async () => configExists("hosts.json.gpg"), { timeout: 15000, interval: 300 });
    await clickInPage("prefs-close");

    await openMenu();
    expect(await menuItemDisabled("header-menu-list", "Lock library")).toBe(false);
    await shot("stage_11", "header-menu.png"); // the menu now holds the three new entries
    await menuItemClick("header-menu-list", "Lock library");
    await (await byTestId("gpg-modal")).waitForExist({ timeout: 10000 });
    expect(await (await byTestId("gpg-title")).getText()).toBe("Unlock your library");

    // Locked: a backup is refused, and so is any save (Rust has no passphrase).
    expect((await invokeExport(null)).code).toBe("locked");
    expect(backups()).toEqual([]);

    // Unlocking makes it work again.
    await typeInto("gpg-pass", "test-passphrase-1");
    await clickInPage("gpg-submit");
    await (await byTestId("gpg-modal")).waitForExist({ timeout: 10000, reverse: true });
    await browser.waitUntil(async () => (await invokeExport(null)).code === undefined, {
      timeout: 15000,
      interval: 400,
    });
    expect(backups().length).toBe(1);
  });
});
