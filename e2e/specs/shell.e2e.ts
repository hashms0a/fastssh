import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "@wdio/globals";
import { byTestId, clickInPage, clickRow, configDir, loadFixture, shot } from "../helpers";
import { tmpDir } from "../paths";

/**
 * Stage 2 acceptance: real layout (header + sidebar + splitter +
 * workspace), grouped/naturally-sorted/filterable library, Localhost
 * first, collapse + splitter width + theme persist across a restart
 * (browser.reloadSession() re-runs boot() exactly like a relaunch).
 */
const T = process.env.FASTSSH_TESTENV ?? path.join(os.homedir(), "fastssh-testenv");
const settingsFile = path.join(configDir, "settings.json");

// (The tauri-service $$ resolves to an array of raw elements; its .map()
// returns a chainable, not an array, so collect with a plain loop.)
async function attrAll(sel: string, attr: string): Promise<string[]> {
  const els = await $$(sel);
  const out: string[] = [];
  for (const el of els) out.push((await el.getAttribute(attr)) ?? "");
  return out;
}

const rowNames = async () => attrAll('[data-testid="host-row"]', "data-name");
const groupNames = async () =>
  (await attrAll('[data-testid^="group-"]', "data-testid"))
    .filter((id) => !id.startsWith("group-header") && !id.startsWith("group-count"))
    .map((id) => id.slice("group-".length));

function readSettings(): { panelSize: number; collapsedGroups: string[]; useDarkTheme: boolean } {
  return JSON.parse(fs.readFileSync(settingsFile, "utf8"));
}

// wdio clearValue() does not fire React's onChange on WebKit; select-all +
// delete + keystrokes go through the real input path.
async function typeFilter(text: string): Promise<void> {
  const input = await byTestId("host-filter");
  await input.click();
  await browser.keys(["Control", "a"]);
  await browser.keys(["Delete"]);
  for (const ch of text) await browser.keys([ch]);
}

const sidebarWidth = () =>
  browser.execute(() => Math.round(document.querySelector('[data-testid="sidebar"]')!.getBoundingClientRect().width));

async function dragSplitterTo(x: number): Promise<void> {
  // Dispatch the pointer sequence in-page: WebKitWebDriver's native
  // pointer actions land on composited layers inconsistently after the
  // sidebar has been interacted with (down gets swallowed).
  await browser.execute((target) => {
    const sp = document.querySelector('[data-testid="splitter"]') as HTMLElement;
    const r = sp.getBoundingClientRect();
    const at = (type: string, clientX: number) =>
      sp.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          button: 0,
          clientX,
          clientY: 400,
        }),
      );
    sp.setPointerCapture = () => undefined;
    sp.releasePointerCapture = () => undefined;
    at("pointerdown", r.x + 2);
    at("pointermove", target);
    at("pointerup", target);
  }, x);
  await browser.pause(900); // 500 ms window debounce + 400 ms settings debounce
}

describe("app shell (Stage 2)", () => {
  before(async () => {
    // Specs never depend on each other: start from the legacy fixture set.
    await loadFixture("legacy");
  });

  it("shows Local first, groups in natural order, item2 before item10", async () => {
    await shot("stage_02", "sidebar-dark.png");
    expect(await groupNames()).toEqual(["Local", "Broken", "Lab", "Unreachable"]);
    expect(await rowNames()).toEqual(["Localhost", "bad-port", "item2", "item10", "my-server", "Сервер-1"]);
    // Group counts: Lab has 2 hosts. (getText is flaky on WebKitWebDriver; HTML works.)
    expect(await (await byTestId("group-count-Lab")).getHTML()).toContain(">2<");
    // Sub-line: an account host shows its ssh user@host, Localhost its kind.
    // An account host shows "<account user>@<host>:<port>" (the fixture account
    // owns item2, so the user depends on which spec ran last).
    expect(await (await $('//div[@data-testid="host-row" and @data-name="item2"]')).getHTML()).toContain(
      "@127.0.0.1:2222",
    );
    expect(await (await $('//div[@data-testid="host-row" and @data-name="Localhost"]')).getHTML()).toContain(
      "local shell",
    );
  });

  it("the filter narrows to Lab and restoring brings every group back", async () => {
    await typeFilter("item");
    expect(await groupNames()).toEqual(["Lab"]);
    expect(await rowNames()).toEqual(["item2", "item10"]);
    await typeFilter("");
    expect(await groupNames()).toEqual(["Local", "Broken", "Lab", "Unreachable"]);
  });

  it("collapse Lab + restart: it stays collapsed", async () => {
    await (await byTestId("group-header-Lab")).click();
    expect(await rowNames()).not.toContain("item2");
    await browser.pause(900); // settings debounce (500 + 400 ms)
    expect(readSettings().collapsedGroups).toContain("Lab");
    await shot("stage_02", "lab-collapsed.png");

    await browser.reloadSession();
    await browser.pause(1500);
    expect(await rowNames()).not.toContain("item2");
    await (await byTestId("group-header-Lab")).click(); // expand again
    expect(await rowNames()).toContain("item2");
  });

  it("the Hosts/Accounts toggle shows lab-key on the Accounts side", async () => {
    await (await byTestId("sidebar-toggle-accounts")).click();
    const rows = await $$('[data-testid="account-row"]');
    expect(rows.length).toBe(1);
    expect(await rows[0]!.getAttribute("data-name")).toBe("lab-key");
    await shot("stage_02", "accounts-side.png");
    await (await byTestId("sidebar-toggle-hosts")).click();
  });

  it("selecting a host shows its landing card (Connect/Edit/Remove)", async () => {
    // A retry starts with no tab for item10, otherwise there is no card to check.
    await loadFixture("legacy");
    await clickRow("item10");
    const landing = await byTestId("connection-landing");
    expect(await landing.getAttribute("data-name")).toBe("item10");
    await expect(byTestId("landing-connect")).toBeExisting();
    await expect(byTestId("landing-edit")).toBeExisting();
    await expect(byTestId("landing-remove")).toBeExisting();
    await shot("stage_02", "landing-item10.png");
    // Stage 5 made Connect real: it opens the host's tab instead of showing
    // the Stage 2 "Coming soon" toast.
    await clickInPage("landing-connect");
    await browser.waitUntil(async () => (await $$('[data-testid="tab"]')).length === 1, {
      timeout: 10000,
      interval: 250,
    });
  });

  it("the header menu and the row context menu open with the plan's items", async () => {
    await (await byTestId("header-menu")).click();
    const menu = await byTestId("header-menu-list");
    await expect(menu).toBeExisting();
    const html = await menu.getHTML();
    for (const item of ["Preferences", "Import from EasySSH", "About", "Quit"]) {
      expect(html).toContain(item);
    }
    await shot("stage_02", "header-menu.png");
    await browser.keys(["Escape"]);
    await expect(menu).not.toBeExisting();

    const row = await $('//div[@data-testid="host-row" and @data-name="item2"]');
    await row.click({ button: "right" });
    const ctx = await byTestId("context-menu");
    await expect(ctx).toBeExisting();
    const ctxHtml = await ctx.getHTML();
    for (const item of ["Connect", "Edit", "Duplicate", "Remove"]) {
      expect(ctxHtml).toContain(item);
    }
    await shot("stage_02", "context-menu.png");
    await browser.keys(["Escape"]);
    await expect(ctx).not.toBeExisting();
  });

  it("the splitter drags, clamps to 160-600, and the width survives a restart", async () => {
    const start = await sidebarWidth();
    const wide = start > 300 ? 260 : 450;
    const narrow = 120;

    await dragSplitterTo(wide);
    expect(await sidebarWidth()).toBe(wide);
    const s1 = readSettings();
    expect(s1.panelSize).toBe(wide);

    await dragSplitterTo(narrow); // below the 160 clamp
    expect(await sidebarWidth()).toBe(160);
    expect(readSettings().panelSize).toBe(160);

    await browser.reloadSession();
    await browser.pause(1500); // let React mount
    expect(await sidebarWidth()).toBe(160);
    await dragSplitterTo(start);
    expect(await sidebarWidth()).toBe(start);
    expect(readSettings().panelSize).toBe(start);
  });

  it("useDarkTheme in settings.json switches the palette on reload", async () => {
    const s = readSettings();
    fs.writeFileSync(settingsFile, JSON.stringify({ ...s, useDarkTheme: false }));
    await browser.reloadSession();
    await browser.pause(1500);
    expect(await browser.execute(() => document.documentElement.classList.contains("dark"))).toBe(false);
    await shot("stage_02", "sidebar-light.png");
    fs.writeFileSync(settingsFile, JSON.stringify({ ...s, useDarkTheme: true }));
    await browser.reloadSession();
    await browser.pause(1500);
    expect(await browser.execute(() => document.documentElement.classList.contains("dark"))).toBe(true);
  });

  it("typing in the filter has no visible lag with 2000 hosts", async () => {
    fs.copyFileSync(path.join(T, "big", "hosts.json"), path.join(configDir, "hosts.json"));
    try {
      await browser.reloadSession();
      await browser.pause(2500);
      const wall0 = Date.now();
      const perf0 = await browser.execute(() => performance.now());
      await typeFilter("node199");
      // node199 + node1990..node1999 = 11 rows (spread over 6 rack groups).
      await browser.waitUntil(async () => (await $$('[data-testid="host-row"]')).length === 11, {
        timeout: 15000,
        interval: 50,
      });
      const wallMs = Date.now() - wall0;
      const renderMs = (await browser.execute(() => performance.now())) - perf0;
      fs.mkdirSync(tmpDir, { recursive: true });
      fs.writeFileSync(path.join(tmpDir, "bigfilter.json"), JSON.stringify({ wallMs, renderMs }));
      // eslint-disable-next-line no-console
      console.log(`[stage2] 2000-host filter: wall=${wallMs} ms render=${renderMs.toFixed(0)} ms`);
      expect(wallMs).toBeLessThan(5000);
      await shot("stage_02", "big-filter.png");
    } finally {
      fs.copyFileSync(path.join(T, "legacy", "hosts.json"), path.join(configDir, "hosts.json"));
    }
  });
});
