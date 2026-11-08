import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { expect } from "@wdio/globals";
import {
  byTestId,
  clickInPage,
  configDir,
  connectRow,
  expectPrompt,
  focusTerm,
  hookClipboard,
  hookTabIds,
  loadFixture,
  readBuffer,
  resetSandbox,
  shot,
  toastTexts,
  typeInto,
} from "../helpers";

/**
 * Stage 7 acceptance: the Bookmarks popover (R3) and "Show in File Browser"
 * (R16). Terminal state is read through window.__fastsshTest; popover rows are
 * read and clicked inside the page, like the Stage 6 specs do, because a W3C
 * click would first hit the popover's outside-click handler.
 */

const openPopover = async (): Promise<void> => {
  await clickInPage("bookmarks");
  await (await byTestId("bookmarks-popover")).waitForExist({ timeout: 5000 });
};

const closePopover = async (): Promise<void> => {
  await browser.keys(["Escape"]);
  await browser.waitUntil(async () => !(await (await byTestId("bookmarks-popover")).isExisting()), {
    timeout: 5000,
    interval: 200,
  });
};

const bookmarkNames = async (): Promise<string[]> => {
  const out: string[] = [];
  for (const el of await $$('[data-testid="bookmark-row"]')) out.push((await el.getAttribute("data-name")) ?? "");
  return out;
};

/** Click one row's Run/Delete inside the page. */
const clickRowButton = async (name: string, testId: string): Promise<void> => {
  await browser.execute(
    (n, id) => {
      const row = [...document.querySelectorAll<HTMLElement>('[data-testid="bookmark-row"]')].find(
        (e) => e.getAttribute("data-name") === n,
      );
      row
        ?.querySelector<HTMLElement>(`[data-testid="${id}"]`)
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    },
    name,
    testId,
  );
  await browser.pause(300);
};

const runState = async (name: string): Promise<{ disabled: boolean; title: string }> =>
  (await browser.execute((n) => {
    const row = [...document.querySelectorAll('[data-testid="bookmark-row"]')].find(
      (e) => e.getAttribute("data-name") === n,
    );
    const run = row?.querySelector('[data-testid="bookmark-run"]');
    return { disabled: run ? run.hasAttribute("disabled") : true, title: run?.getAttribute("title") ?? "" };
  }, name)) as { disabled: boolean; title: string };

const readBookmarksFile = (): Array<{ name: string; command: string }> => {
  const file = path.join(configDir, "bookmarks.json");
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
};

const writeBookmarksFile = (list: readonly unknown[]): void => {
  fs.writeFileSync(path.join(configDir, "bookmarks.json"), JSON.stringify(list));
};

/** Add a bookmark through the form. */
const addThroughForm = async (name: string, command: string): Promise<void> => {
  await typeInto("bookmark-name", name);
  await typeInto("bookmark-command", command);
  await clickInPage("bookmark-add");
};

/** Answer the fingerprint question when the sandbox known_hosts is empty. */
const acceptFingerprintIfAsked = async (): Promise<void> => {
  if (await (await byTestId("fingerprint-modal")).isExisting()) await clickInPage("fingerprint-yes");
};

const clearToasts = async (): Promise<void> => {
  await browser.execute(() => {
    document.querySelectorAll<HTMLElement>('[data-testid="toast-dismiss"]').forEach((b) => b.click());
  });
  await browser.pause(400);
};

/** tauri-plugin-log's file, where the launcher chain is logged. */
const appLog = (): string => path.join(os.homedir(), ".local", "share", "io.github.fastssh.app", "logs", "FastSSH.log");

describe("bookmarks popover + sftp file browser (Stage 7)", () => {
  before(() => {
    resetSandbox("legacy");
  });

  // R3: add, search, inline errors, Run in a Localhost tab, persistence.
  it("adds a bookmark, runs it in a Localhost tab, and still has it after a restart", async () => {
    await loadFixture("legacy");
    await openPopover();

    // The fixture set ships two bookmarks, and no tab is open yet.
    expect(await bookmarkNames()).toEqual(["uptime", "disk"]);
    const first = await runState("uptime");
    // R3: with no open tab Run is disabled, with the plan's tooltip.
    expect(first.disabled).toBe(true);
    expect(first.title).toBe("Open a terminal first");

    // Both fields are required (task 7.1).
    await clickInPage("bookmark-add");
    await (await byTestId("bookmark-name-error")).waitForExist({ timeout: 4000 });
    expect(await (await byTestId("bookmark-name-error")).getText()).toBe("Name is required");
    expect(await (await byTestId("bookmark-command-error")).getText()).toBe("Command is required");
    expect(await bookmarkNames()).toHaveLength(2);

    // The search field filters on the name AND the command.
    await typeInto("bookmark-search", "df");
    expect(await bookmarkNames()).toEqual(["disk"]);
    await closePopover();
    await openPopover();
    // The query is dropped when the popover closes.
    expect(await bookmarkNames()).toEqual(["uptime", "disk"]);

    await addThroughForm("hello", "echo bookmark-ok");
    await browser.waitUntil(async () => (await bookmarkNames()).includes("hello"), {
      timeout: 6000,
      interval: 250,
    });

    // A duplicate name shows the inline error and changes nothing.
    await addThroughForm("hello", "echo twice");
    await (await byTestId("bookmark-name-error")).waitForExist({ timeout: 4000 });
    expect(await (await byTestId("bookmark-name-error")).getText()).toBe("Name is already taken");
    expect((await bookmarkNames()).filter((n) => n === "hello")).toHaveLength(1);
    expect(readBookmarksFile().filter((b) => b.name === "hello")).toHaveLength(1);

    // Run needs an open tab: create the Local Shell, then run "hello".
    await closePopover();
    await clickInPage("local-shell");
    await browser.waitUntil(async () => (await hookTabIds()).length > 0, { timeout: 12000, interval: 250 });
    const tab = (await hookTabIds())[0]!;
    await browser.waitUntil(async () => (await readBuffer(tab)).length > 0, { timeout: 8000, interval: 250 });

    await openPopover();
    // R3: once a tab is open, Run works.
    expect((await runState("hello")).disabled).toBe(false);
    await clickRowButton("hello", "bookmark-run");
    // Run closes the popover so the output is visible.
    expect(await (await byTestId("bookmarks-popover")).isExisting()).toBe(false);
    await browser.waitUntil(async () => (await readBuffer(tab)).includes("bookmark-ok"), {
      timeout: 15000,
      interval: 300,
    });

    // Persistence: bookmarks.json holds it, and a restart shows it again.
    expect(readBookmarksFile().map((b) => b.name)).toContain("hello");
    await browser.reloadSession();
    await (await byTestId("header-bar")).waitForExist();
    await openPopover();
    expect(await bookmarkNames()).toContain("hello");
  });

  // Delete asks before it removes the row and the record.
  it("deleting asks for confirmation; Cancel keeps the bookmark", async () => {
    await loadFixture("legacy");
    await openPopover();
    await clickRowButton("uptime", "bookmark-delete");
    await (await byTestId("confirm-dialog")).waitForExist({ timeout: 5000 });
    expect(await (await byTestId("confirm-message")).getText()).toContain("Remove bookmark uptime?");

    await clickInPage("confirm-cancel");
    await browser.waitUntil(async () => !(await (await byTestId("confirm-dialog")).isExisting()), {
      timeout: 5000,
      interval: 200,
    });
    expect(await bookmarkNames()).toContain("uptime");
    expect(readBookmarksFile().map((b) => b.name)).toContain("uptime");

    await clickRowButton("uptime", "bookmark-delete");
    await clickInPage("confirm-ok");
    await browser.waitUntil(async () => !(await bookmarkNames()).includes("uptime"), {
      timeout: 6000,
      interval: 250,
    });
    expect(readBookmarksFile().map((b) => b.name)).toEqual(["disk"]);
  });

  // Bullet: a bookmark run on item10 prints the CONTAINER's hostname.
  it("a bookmark run in an item10 tab prints the container hostname", async () => {
    const containerName = execSync("docker exec fastssh-sshd hostname", { encoding: "utf8" }).trim();
    const localName = execSync("hostname", { encoding: "utf8" }).trim();
    expect(containerName).not.toBe(localName);

    resetSandbox("legacy");
    writeBookmarksFile([{ id: "b1", name: "remote", command: "echo remote-$(hostname)" }]);
    await browser.reloadSession();
    await (await byTestId("header-bar")).waitForExist();

    const tab = await connectRow("item10");
    await acceptFingerprintIfAsked();
    await expectPrompt(tab, "tester");

    await openPopover();
    expect((await runState("remote")).disabled).toBe(false);
    await clickRowButton("remote", "bookmark-run");
    await browser.waitUntil(async () => (await readBuffer(tab)).includes(`remote-${containerName}`), {
      timeout: 20000,
      interval: 400,
    });
    expect(await readBuffer(tab)).not.toContain(`remote-${localName}`);
  });

  // R16: Ctrl+Shift+E in a remote tab. On this machine the desktop has no
  // sftp:// handler (Nautilus 50 registers none; gio's mount needs an
  // interactive password), so the chain fails and Section 2's toast with the
  // address and a Copy button is the specified behaviour — asserted here end
  // to end, together with the Rust log line that names the launcher.
  it("Ctrl+Shift+E asks for sftp://tester@127.0.0.1:2222 and offers to copy the address", async () => {
    await loadFixture("legacy");
    const tab = await connectRow("item10");
    await acceptFingerprintIfAsked();
    await expectPrompt(tab, "tester");
    await clearToasts();

    await focusTerm(tab);
    await browser.keys(["Control", "Shift", "e"]);

    const url = "sftp://tester@127.0.0.1:2222/";
    await browser.waitUntil(async () => (await toastTexts()).some((t) => t.includes(url)), {
      timeout: 15000,
      interval: 400,
    });

    await (await byTestId("toast-copy")).waitForExist({ timeout: 5000 });
    await clickInPage("toast-copy");
    expect(await hookClipboard()).toBe(url);
    // Toast text includes the button labels, so match with includes().
    expect((await toastTexts()).some((t) => t.includes("Copied the address"))).toBe(true);

    // The Rust side logged the launcher it tried (quoted in the handoff).
    const log = fs.readFileSync(appLog(), "utf8");
    expect(log).toContain(`open_sftp program=xdg-open`);
    expect(log).toContain(url);
    await shot("stage_07", "file-browser-sftp.png");
  });
});
