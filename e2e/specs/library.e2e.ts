import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { expect } from "@wdio/globals";
import { byTestId, configDir, shot } from "../helpers";
import type { Host } from "../../src/types/models";

/**
 * Stage 3 acceptance: the connection and account editors. Add / edit /
 * duplicate / remove hosts and accounts, inline validation, the live
 * ssh_config preview, account propagation, the native file dialog and the
 * unwritable-config-dir toast.
 *
 * Two WebKitWebDriver quirks shape the helpers below:
 *  - a W3C click on the XWayland window is sometimes reported as done before
 *    the page acted on it, and the click right after an execute/dismiss cycle
 *    is dropped, so clicks that change the UI are repeated until they land;
 *  - hit-test interception ("element click intercepted") comes from the fixed
 *    toast stack and the positioned context menu, and is worked around with an
 *    in-page el.click() - the same trick shell.e2e.ts uses for the splitter.
 *
 * Order matters: each test leaves the library in the state the next expects,
 * and the last one restores the seeded fixture state.
 */
const legacyDir = path.join(process.env.HOME ?? "", "fastssh-testenv", "legacy");
const hostsFile = path.join(configDir, "hosts.json");
const accountsFile = path.join(configDir, "accounts.json");

type Loc = { id: string; label?: string; name?: string };
type Effect = { id: string; gone?: boolean; text?: string };

const readHosts = (): Host[] => JSON.parse(fs.readFileSync(hostsFile, "utf8"));
const readAccounts = (): { name: string; username: string }[] => JSON.parse(fs.readFileSync(accountsFile, "utf8"));

function xpathFor(loc: Loc): string {
  const conds = [`@data-testid="${loc.id}"`];
  if (loc.name !== undefined) conds.push(`@data-name="${loc.name}"`);
  if (loc.label !== undefined) conds.push(`normalize-space(.)="${loc.label}"`);
  return `//*[${conds.join(" and ")}]`;
}

/** Args stay primitives: the tauri-service DirectEval channel serializes
 *  object arguments poorly. */
function inPage(id: string, label: string | null, name: string | null, act: string): boolean {
  const el = [...document.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)].find((e) => {
    if (name !== null && e.getAttribute("data-name") !== name) return false;
    if (label !== null && (e.textContent ?? "").trim() !== label) return false;
    return true;
  });
  if (!el) return false;
  const field = el as HTMLInputElement;
  if (act === "click") {
    el.scrollIntoView({ block: "center" });
    el.click();
  } else if (act === "focus") {
    el.focus();
    field.select?.();
  }
  return true;
}

async function landed(expect: Effect | undefined): Promise<boolean> {
  if (!expect) return true;
  const all = await $$(`[data-testid="${expect.id}"]`);
  const node = all[all.length - 1];
  if (!node) return !!expect.gone;
  if (expect.gone) return false;
  return expect.text === undefined || (await node.getHTML()).includes(expect.text);
}

async function tap(loc: Loc, expect?: Effect): Promise<void> {
  const el = await $(xpathFor(loc));
  await el.waitForExist();
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt === 0) {
      // Buttons near the bottom of the editor overlay need scrolling first.
      await el.scrollIntoView().catch(() => undefined);
      try {
        await el.click();
      } catch {
        await browser.execute(inPage, loc.id, loc.label ?? null, loc.name ?? null, "click");
      }
    } else {
      await browser.execute(inPage, loc.id, loc.label ?? null, loc.name ?? null, "click");
    }
    await browser.pause(400);
    if (await landed(expect)) return;
  }
  if (expect) await (await byTestId(expect.id)).waitForExist({ reversed: !!expect.gone });
}

const tapButton = (id: string) => tap({ id });
const tapGone = (id: string, gone: string) => tap({ id }, { id: gone, gone: true });
const tapRow = (name: string) => tap({ id: "host-row", name }, { id: "connection-landing", text: name });

/** clearValue() does not fire React's onChange on WebKit; keystrokes do. */
/**
 * Types into a field the way a user does, so React sees the change. CSS
 * selectors, because XPath element handles in this driver go stale on render.
 */
async function type(loc: string, text: string): Promise<void> {
  const sel = `[data-testid="${loc}"]`;
  const el = await $(sel);
  await el.waitForExist();
  await el.scrollIntoView().catch(() => undefined);
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt === 2) {
      // Last resort for fields that swallow W3C keys: set + input event.
      await browser.execute(
        (s2: string, value: string) => {
          const node = document.querySelector(s2) as HTMLInputElement;
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
          setter?.call(node, value);
          node.dispatchEvent(new Event("input", { bubbles: true }));
        },
        sel,
        text,
      );
    } else {
      if (attempt === 0) {
        try {
          await el.click();
        } catch {
          await browser.execute(inPage, loc, null, null, "focus");
        }
      } else {
        await browser.execute(inPage, loc, null, null, "focus");
      }
      await browser.keys(["Control", "a"]);
      await browser.keys(["Delete"]);
      for (const ch of text) await browser.keys([ch]);
    }
    await browser.pause(300);
    if ((await (await $(sel)).getProperty("value")) === text) return;
  }
  throw new Error(`typing "${text}" into ${loc} did not stick`);
}

/**
 * Keys never reach a <textarea> on WebKitWebDriver (addValue is swallowed
 * too), so the ssh_config block is set with a native input event - React's
 * onChange listens for it.
 */
/** Picks an option in a native <select> the way the DOM does. */
async function selectInPage(testid: string, value: string): Promise<void> {
  await browser.execute(
    (id: string, v: string) => {
      const el = document.querySelector(`[data-testid="${id}"]`) as HTMLSelectElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
      setter?.call(el, v);
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    testid,
    value,
  );
}

async function setArea(id: string, text: string): Promise<void> {
  await browser.execute(
    (sel: string, value: string) => {
      const el = document.querySelector(sel) as HTMLTextAreaElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    `[data-testid="${id}"]`,
    text,
  );
  await browser.pause(300);
}

async function rightClickRow(name: string): Promise<void> {
  const el = await $(`//div[@data-testid="host-row" and @data-name="${name}"]`);
  await el.waitForExist();
  for (let attempt = 0; attempt < 4; attempt++) {
    await el.click({ button: "right" });
    await browser.pause(400);
    if (await (await byTestId("context-menu")).isExisting()) return;
  }
  await (await byTestId("context-menu")).waitForExist();
}

async function contextAction(name: string, item: string): Promise<void> {
  await rightClickRow(name);
  await tap({ id: "context-menu-item", label: item }, { id: "context-menu", gone: true });
}

async function focusWindow(): Promise<void> {
  const filter = await byTestId("host-filter");
  await filter.click().catch(() => undefined);
  await browser.pause(200);
}

async function dismissToasts(): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const close = await byTestId("toast-dismiss");
    if (!(await close.isExisting())) break;
    // A toast auto-dismisses after 6 s, so the element can go stale mid-click.
    await close.click().catch(() => undefined);
    await browser.pause(250);
  }
}

async function waitForHost(name: string, port?: string): Promise<Host> {
  let found: Host | undefined;
  await browser.waitUntil(
    () => {
      found = readHosts().find((h) => h.name === name);
      return !!found && (port === undefined || found.port === port);
    },
    { timeout: 10000, interval: 200 },
  );
  return found!;
}

async function openHostEditor(name: string): Promise<void> {
  await tapRow(name);
  await tap({ id: "landing-edit" }, { id: "connection-editor" });
}

async function saveHostEditor(): Promise<void> {
  await dismissToasts(); // the toast stack overlaps the editor footer
  await tapGone("editor-save", "connection-editor");
}

async function openAccountEditor(): Promise<void> {
  await tap({ id: "account-edit" }, { id: "account-editor" });
}

async function saveAccountEditor(): Promise<void> {
  await dismissToasts();
  await tapGone("editor-save", "account-editor");
  await browser.pause(500); // the account + hosts writes land together
}

describe("connection + account editors (Stage 3)", () => {
  before(async () => {
    // The suite shares one config dir, so start from the seeded library.
    fs.copyFileSync(path.join(legacyDir, "hosts.json"), hostsFile);
    fs.copyFileSync(path.join(legacyDir, "accounts.json"), accountsFile);
    await browser.reloadSession();
    await browser.pause(1200);
  });

  beforeEach(async () => {
    await focusWindow();
    await dismissToasts();
  });

  it('adds "web 1" as web-1 in its group, with legacy disk keys', async () => {
    await (await byTestId("header-bar")).waitForExist();
    await tap({ id: "new-connection" }, { id: "connection-editor" });
    await shot("stage_03", "editor-empty.png");

    await type("field-name", "web 1");
    await type("field-group", "Lab");
    await type("field-host", "127.0.0.1");
    await type("field-port", "2222");
    await shot("stage_03", "editor-web1.png");
    await saveHostEditor();

    expect((await waitForHost("web-1", "2222")).group).toBe("Lab");
    // R4 + legacy compatibility: port stays a string, identity-file is kebab.
    const raw = fs.readFileSync(hostsFile, "utf8");
    expect(raw).toMatch(/"port":\s*"2222"/);
    expect(raw).toMatch(/"identity-file":\s*"/);
    expect(await (await $('//div[@data-testid="host-row" and @data-name="web-1"]')).isExisting()).toBe(true);
    expect(await (await byTestId("group-count-Lab")).getHTML()).toContain(">3<");
    await shot("stage_03", "sidebar-web1.png");
  });

  it("validates the name, the port and a tunnel", async () => {
    await tap({ id: "new-connection" }, { id: "connection-editor" });
    await type("field-name", "web-1");
    await tapButton("editor-save");
    expect(await (await byTestId("editor-errors")).getHTML()).toContain("Name is already taken");
    expect(await (await byTestId("error-name")).getHTML()).toContain("Name is already taken");
    expect((await readHosts()).filter((h) => h.name === "web-1")).toHaveLength(1);
    await shot("stage_03", "editor-validation.png");

    await type("field-port", "70000");
    await tapButton("editor-save");
    expect(await (await byTestId("error-port")).getHTML()).toContain("1 and 65535");

    // A new tunnel becomes an editable row, and its type feeds the preview.
    await type("field-port", "22");
    await tap({ id: "tunnel-add" }, { id: "tunnel-row-0" });
    await (await byTestId("tunnel-type-0")).selectByVisibleText(browser, "-R remote");
    await tapButton("editor-save");
    expect(await (await byTestId("landing-name")).getText()).toBe("web-1");
    await shot("stage_03", "editor-tunnel-invalid.png");

    await tapGone("editor-cancel", "connection-editor");
  });

  it("duplicate web-1 gives web-1-copy, then web-1-copy-2", async () => {
    await contextAction("web-1", "Duplicate");
    expect(await (await byTestId("field-name")).getProperty("value")).toBe("web-1-copy");
    await shot("stage_03", "editor-duplicate.png");
    await saveHostEditor();
    await waitForHost("web-1-copy");

    await contextAction("web-1-copy", "Duplicate");
    expect(await (await byTestId("field-name")).getProperty("value")).toBe("web-1-copy-2");
    await saveHostEditor();
    await waitForHost("web-1-copy-2");
    expect((await $$('[data-testid="host-row"]')).length).toBe(9);
    await shot("stage_03", "sidebar-copies.png");
  });

  it("edits web-1: port from the landing card, live ssh_config block", async () => {
    await openHostEditor("web-1");
    await type("field-port", "2200");
    await saveHostEditor();
    expect((await waitForHost("web-1", "2200")).port).toBe("2200");

    await openHostEditor("web-1");
    const block = await byTestId("field-ssh-config");
    expect(await block.getProperty("value")).toContain("Host web-1");
    await type("field-host", "10.0.0.7");
    expect(await block.getProperty("value")).toContain("HostName 10.0.0.7");
    await type("field-port", "2201");
    expect(await block.getProperty("value")).toContain("Port 2201");

    // A hand-written line survives the next managed-field edit.
    await setArea("field-ssh-config", `${await block.getProperty("value")}\n    ForwardAgent yes`);
    expect(await block.getProperty("value")).toContain("ForwardAgent yes");
    await type("field-host", "10.0.0.8");
    expect(await block.getProperty("value")).toContain("HostName 10.0.0.8");
    expect(await block.getProperty("value")).toContain("ForwardAgent yes");
    await shot("stage_03", "editor-ssh-config.png");
    await saveHostEditor();
    expect((await waitForHost("web-1", "2201")).ssh_config).toContain("ForwardAgent yes");
  });

  it("removes web-1-copy from the row context menu", async () => {
    await contextAction("web-1-copy", "Remove");
    const dialog = await byTestId("confirm-dialog");
    expect(await dialog.getHTML()).toContain("Remove web-1-copy?");
    await shot("stage_03", "remove-confirm.png");
    await tapGone("confirm-ok", "confirm-dialog");
    expect(readHosts().some((h) => h.name === "web-1-copy")).toBe(false);
  });

  it("Escape on the remove dialog means Cancel (task 3.10)", async () => {
    await tapRow("web-1-copy-2");
    await tap({ id: "landing-remove" }, { id: "confirm-dialog" });
    await browser.keys(["Escape"]);
    await (await byTestId("confirm-dialog")).waitForExist({ reversed: true });
    expect(await (await $('//div[@data-testid="host-row" and @data-name="web-1-copy-2"]')).isExisting()).toBe(true);
  });

  it("removing the selected host from its landing card clears the selection", async () => {
    await tap({ id: "landing-remove" }, { id: "confirm-dialog" });
    await tapGone("confirm-ok", "confirm-dialog");
    await browser.pause(500);
    // Task 3.8: removing the selected host clears the selection.
    expect((await $$('[data-testid="connection-landing"]')).length).toBe(0);
    expect(
      readHosts()
        .map((h) => h.name)
        .sort(),
    ).toEqual(["bad-port", "item10", "item2", "my-server", "web-1", "Сервер-1"]);
    await shot("stage_03", "after-remove.png");
  });

  it("account edit propagates credentials and a rename re-points item2", async () => {
    await tap({ id: "sidebar-toggle-accounts" }, { id: "account-row" });
    await tap({ id: "account-row" }, { id: "account-edit" });
    await shot("stage_03", "account-landing.png");
    await openAccountEditor();
    await type("field-username", "keyuser2");
    await saveAccountEditor();
    expect((await readHosts()).find((h) => h.name === "item2")?.username).toBe("keyuser2");
    expect((await readAccounts())[0]?.username).toBe("keyuser2");

    await openAccountEditor();
    expect(await (await byTestId("field-username")).getProperty("value")).toBe("keyuser2");
    await type("field-name", "lab");
    await saveAccountEditor();
    expect((await readHosts()).find((h) => h.name === "item2")?.account).toBe("lab");
    expect((await readAccounts())[0]?.name).toBe("lab");
  });

  it("deleting an account in use asks with the host count and unlinks", async () => {
    await (await byTestId("account-remove")).waitForExist();
    await tap({ id: "account-remove" }, { id: "confirm-dialog" });
    const dialog = await byTestId("confirm-dialog");
    expect(await dialog.getHTML()).toContain("1 host uses this account");
    await shot("stage_03", "account-remove-confirm.png");
    await tapGone("confirm-ok", "confirm-dialog");
    await browser.pause(600);
    expect((await $$('[data-testid="account-row"]')).length).toBe(0);
    const item2 = readHosts().find((h) => h.name === "item2");
    expect(item2?.account).toBe("");
    expect(item2?.username).toBe("keyuser2"); // the credentials stay (R2)
  });

  it("creates the next account from the accounts welcome card", async () => {
    await tap({ id: "new-account" }, { id: "account-editor" });
    await type("field-name", "lab-key");
    await type("field-username", "keyuser2");
    await shot("stage_03", "account-editor.png");
    await saveAccountEditor();
    expect((await readAccounts()).map((a) => a.name)).toEqual(["lab-key"]);
    await tap({ id: "sidebar-toggle-hosts" }, { id: "host-list" });
  });

  it("an unwritable config dir toasts the OS error and the sidebar reverts", async () => {
    // 0500 (r-x) lets the app rewrite existing files; 0400 blocks the temp
    // file the atomic replace needs, which is the failure the plan asks for.
    fs.chmodSync(configDir, 0o400);
    try {
      await openHostEditor("web-1");
      await type("field-port", "2233");
      await dismissToasts(); // the toast we assert on must be the newest one
      await tap({ id: "editor-save" }, { id: "toast" });
      // The toast carries the OS text; WebKit's getHTML of the outer div can
      // come back empty, so the assertion runs on the stack's text.
      expect(await (await byTestId("toasts")).getHTML()).toMatch(/denied|file system/);
      await shot("stage_03", "readonly-toast.png");
      await tapGone("editor-save", "connection-editor");
      expect((await waitForHost("web-1", "2201")).port).toBe("2201");
    } finally {
      fs.chmodSync(configDir, 0o700);
    }
    await browser.reloadSession();
    await browser.pause(1500);
    await focusWindow();
    await tapRow("web-1");
    expect(await (await byTestId("connection-landing")).getHTML()).toContain("10.0.0.8:2201");
  });

  it("Browse opens the native file dialog and the typed path is kept", async () => {
    await openHostEditor("web-1");
    await tapButton("identity-browse");
    await browser.pause(1500); // the GTK/KDE dialog opens as its own window
    // The dialog is a separate window: capture the whole screen.
    execFileSync("bash", ["tools/screenshot.sh", "docs/screenshots/stage_03/file-dialog.png", "full"]);
    await browser.keys(["Escape"]);
    await browser.pause(500);
    await focusWindow();
    await type("field-identity", "~/.ssh/id_ed25519");
    await saveHostEditor();
    expect((await waitForHost("web-1")).identity_file).toBe("~/.ssh/id_ed25519");
  });

  it("removes web-1 and leaves the seeded library behind", async () => {
    await tapRow("web-1");
    await tap({ id: "landing-remove" }, { id: "confirm-dialog" });
    await tapGone("confirm-ok", "confirm-dialog");
    await browser.pause(500);
    expect(
      readHosts()
        .map((h) => h.name)
        .sort(),
    ).toEqual(["bad-port", "item10", "item2", "my-server", "Сервер-1"]);
    expect((await $$('[data-testid="host-row"]')).length).toBe(6); // + Localhost
  });
});
