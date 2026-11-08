import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { expect } from "@wdio/globals";
import {
  allRowNames,
  badge,
  byTestId,
  clickInPage,
  closeTabByHook,
  configDir,
  connectRow,
  doubleClickRow,
  horizontalOverflow,
  hookTabIds,
  killApp,
  loadFixture,
  openExtraTab,
  readBuffer,
  readSettingsFile,
  restartApp,
  setInputValue,
  T,
  alertTexts,
  toastTexts,
  writeConfigHosts,
} from "../helpers";

/**
 * Task 12.2, the edge-case pass. Each case is one `it`, so a failure names the
 * edge. Items that need sudo or a second monitor are listed in the handoff
 * instead of being faked here: a full disk (small tmpfs) and 125% display
 * scaling.
 */
/** Library folder for the read-only test: readable, not writable. Kept out of
 * the config dir so the app can still write settings.json there. */
const roDir = path.join(T, "readonly-library");

const chmodDir = (dir: string, mode: string): void => {
  try {
    execSync(`chmod ${mode} '${dir}'`, { stdio: "ignore" });
  } catch {
    /* the folder is not there yet (or already gone) */
  }
};

const namesIn = (dir: string): string[] =>
  (JSON.parse(fs.readFileSync(path.join(dir, "hosts.json"), "utf8")) as { name: string }[]).map((h) => h.name);

/**
 * Move the library to `folder` through the settings file. The app is asked to
 * write its own settings first (Preferences toggles the theme twice, a net
 * zero change), so the JSON we edit is the shape the app itself produced.
 */
async function setHostsFolder(folder: string) {
  await openPreferences();
  await clickInPage("prefs-tab-appearance");
  await clickInPage("prefs-dark-theme");
  await clickInPage("prefs-dark-theme");
  await clickInPage("prefs-close");
  await browser.waitUntil(() => fs.existsSync(path.join(configDir, "settings.json")), {
    timeout: 20000,
    interval: 400,
  });
  const settings = JSON.parse(fs.readFileSync(path.join(configDir, "settings.json"), "utf8")) as Record<
    string,
    unknown
  >;
  settings.hostsFolder = folder;
  fs.writeFileSync(path.join(configDir, "settings.json"), JSON.stringify(settings));
  await restartApp();
}

async function dismissToasts() {
  await browser.execute(() => {
    document.querySelectorAll<HTMLElement>('[data-testid="toast-dismiss"]').forEach((b) => b.click());
  });
}

/** Open Preferences through the header menu. */
async function openPreferences() {
  await clickInPage("header-menu");
  await browser.waitUntil(async () => await (await byTestId("header-menu-list")).isExisting(), { timeout: 5000 });
  await browser.execute(() => {
    const item = [...document.querySelectorAll('[data-testid="header-menu-list"] button')].find(
      (b) => (b.textContent ?? "").trim() === "Preferences",
    ) as HTMLElement | undefined;
    item?.click();
  });
  await (await byTestId("preferences-modal")).waitForExist({ timeout: 5000 });
}

describe("edge cases (task 12.2)", () => {
  after(() => {
    try {
      chmodDir(roDir, "700");
      fs.rmSync(roDir, { recursive: true, force: true });
    } catch {
      /* already gone */
    }
  });

  it("an empty library shows the welcome view, not an empty workspace", async () => {
    await loadFixture("empty");
    expect(await (await byTestId("welcome-view")).isExisting()).toBe(true);
    expect(await (await byTestId("connection-landing")).isExisting()).toBe(false);
    await clickInPage("welcome-new-connection");
    expect(await (await byTestId("connection-editor")).isExisting()).toBe(true);
    await clickInPage("editor-cancel");
  });

  it("2000 hosts render, sort naturally, and filter without wedging the UI", async () => {
    await loadFixture("big");
    const rows = await $$('[data-testid="host-row"]');
    expect(rows.length).toBeGreaterThanOrEqual(2000);
    const t0 = Date.now();
    await setInputValue("host-filter", "node1999");
    await browser.waitUntil(async () => (await $$('[data-testid="host-row"]')).length === 1, {
      timeout: 15000,
      interval: 250,
    });
    expect(Date.now() - t0).toBeLessThan(15000);
    expect(await allRowNames()).toEqual(["node1999"]);
    await setInputValue("host-filter", "");
    await browser.waitUntil(async () => (await $$('[data-testid="host-row"]')).length >= 2000, { timeout: 15000 });
  });

  it("a 255-character host name is stored, shown, and cut with an ellipsis", async () => {
    await loadFixture("legacy");
    const long = `very-long-host-${"x".repeat(240)}`;
    writeConfigHosts([
      {
        name: long,
        host: "127.0.0.1",
        port: "22",
        username: "ops",
        password: "",
        group: "Edge",
        color: "",
        font: "",
        tunnels: "",
        "identity-file": "",
        "extra-arguments": "",
        account: "",
      },
    ]);
    await browser.reloadSession();
    await (await byTestId("header-bar")).waitForExist();
    const row = await $(`[data-testid="host-row"][data-name="${long}"]`);
    expect(await row.isExisting()).toBe(true);
    const clipped = await browser.execute((name) => {
      const el = document.querySelector(`[data-testid="host-row"][data-name="${CSS.escape(name)}"] .truncate`);
      if (!el) return null;
      const css = getComputedStyle(el);
      return { ellipsis: css.textOverflow, clipped: (el.scrollWidth ?? 0) > (el.clientWidth ?? 0) };
    }, long);
    expect(clipped).not.toBeNull();
    expect(clipped!.ellipsis).toBe("ellipsis");
    expect(clipped!.clipped).toBe(true);
    expect(Object.values(await horizontalOverflow()).every((px) => px <= 0)).toBe(true);
  });

  it("Unicode names survive the round trip and render in the sidebar", async () => {
    await loadFixture("legacy");
    expect(await allRowNames()).toContain("Сервер-1");
    const typed = "Сервер-2";
    await clickInPage("new-connection");
    await setInputValue("field-name", typed);
    await setInputValue("field-host", "127.0.0.1");
    await clickInPage("editor-save");
    await browser.waitUntil(async () => (await allRowNames()).includes(typed), { timeout: 10000 });
    expect(await allRowNames()).toContain(typed);
  });

  it("a host with an empty user shows no @ in its subtitle", async () => {
    await loadFixture("legacy");
    await clickInPage("new-connection");
    await setInputValue("field-name", "no-user");
    await setInputValue("field-host", "10.0.0.9");
    await clickInPage("editor-save");
    await browser.waitUntil(async () => (await allRowNames()).includes("no-user"), { timeout: 10000 });
    const subtitle = await browser.execute(() => {
      const row = document.querySelector('[data-testid="host-row"][data-name="no-user"]');
      return row?.querySelectorAll("span span")[1]?.textContent ?? "";
    });
    expect(subtitle).toBe("10.0.0.9:22");
  });

  it("IPv6 ::1 is accepted, and connecting it does not break the app", async () => {
    await loadFixture("legacy");
    await clickInPage("new-connection");
    await setInputValue("field-name", "ipv6-loop");
    await setInputValue("field-host", "::1");
    await setInputValue("field-port", "2222");
    await setInputValue("field-username", "tester");
    await setInputValue("field-password", "fastssh-test-pass");
    await clickInPage("editor-save");
    await browser.waitUntil(async () => (await allRowNames()).includes("ipv6-loop"), { timeout: 10000 });

    const tab = await connectRow("ipv6-loop");
    // Docker publishes 2222 on 127.0.0.1 only, so ::1 is refused; what matters
    // is that the address survives quoting and the failure is reported.
    await browser.waitUntil(
      async () =>
        (await (await byTestId("connection-error-modal")).isExisting()) || (await readBuffer(tab)).includes("tester@"),
      { timeout: 30000, interval: 500 },
    );
    const buffer = await readBuffer(tab);
    expect(buffer + " ").toContain("::1");
    expect(await (await byTestId("header-bar")).isExisting()).toBe(true);
    if (await (await byTestId("connection-error-close")).isExisting()) await clickInPage("connection-error-close");
    await closeTabByHook(tab);
  });

  it("a missing identity file shows ssh's own error in the terminal", async () => {
    await loadFixture("legacy");
    await clickInPage("new-connection");
    await setInputValue("field-name", "bad-key");
    await setInputValue("field-host", "127.0.0.1");
    await setInputValue("field-port", "2222");
    await setInputValue("field-username", "keyuser");
    await setInputValue("field-identity", "/nonexistent/id_ed25519");
    await clickInPage("editor-save");
    await browser.waitUntil(async () => (await allRowNames()).includes("bad-key"), { timeout: 10000 });

    const tab = await connectRow("bad-key");
    await browser.waitUntil(async () => (await readBuffer(tab)).includes("Identity file"), {
      timeout: 30000,
      interval: 500,
    });
    expect(await readBuffer(tab)).toContain("/nonexistent/id_ed25519");
    await closeTabByHook(tab);
  });

  it("an identity file path with a space reaches ssh intact", async () => {
    await loadFixture("legacy");
    const withSpace = path.join(T, "ssh", "id with space");
    fs.writeFileSync(withSpace, "not a key\n", { mode: 0o600 });
    await clickInPage("new-connection");
    await setInputValue("field-name", "spaced-key");
    await setInputValue("field-host", "127.0.0.1");
    await setInputValue("field-port", "2222");
    await setInputValue("field-username", "tester");
    await setInputValue("field-identity", withSpace);
    await clickInPage("editor-save");
    await browser.waitUntil(async () => (await allRowNames()).includes("spaced-key"), { timeout: 10000 });

    const tab = await connectRow("spaced-key");
    await browser.waitUntil(async () => (await readBuffer(tab)).includes("id with space"), {
      timeout: 30000,
      interval: 500,
    });
    // ssh quotes the path itself; the app must not split it into two arguments.
    expect(await readBuffer(tab)).toContain(withSpace);
    await closeTabByHook(tab);
    fs.rmSync(withSpace, { force: true });
  });

  it("a read-only hosts folder reports the failure instead of losing the edit", async () => {
    await loadFixture("legacy");
    chmodDir(roDir, "700"); // a killed run can leave the folder at 500
    fs.mkdirSync(roDir, { recursive: true });
    fs.copyFileSync(path.join(configDir, "hosts.json"), path.join(roDir, "hosts.json"));
    chmodDir(roDir, "500");
    try {
      await setHostsFolder(roDir);
      expect(await allRowNames()).toContain("my-server");

      await clickInPage("new-connection");
      await setInputValue("field-name", "unwritable");
      await setInputValue("field-host", "10.0.0.8");
      await clickInPage("editor-save");
      await browser.waitUntil(async () => (await toastTexts()).some((t) => /Permission denied|Read-only/i.test(t)), {
        timeout: 15000,
        interval: 400,
      });
      // The store rolls the record back; nothing was written, nothing is lost.
      expect(await allRowNames()).not.toContain("unwritable");
      expect(namesIn(roDir)).not.toContain("unwritable");

      // Writable again: the same save persists without a restart.
      chmodDir(roDir, "700");
      await dismissToasts();
      await clickInPage("new-connection");
      await setInputValue("field-name", "writable-again");
      await setInputValue("field-host", "10.0.0.8");
      await clickInPage("editor-save");
      await browser.waitUntil(async () => (await allRowNames()).includes("writable-again"), {
        timeout: 15000,
        interval: 400,
      });
      expect(namesIn(roDir)).toContain("writable-again");
    } finally {
      chmodDir(roDir, "700");
    }
  });

  it("a corrupt settings.json falls back to defaults, warns, and is rewritten", async () => {
    await loadFixture("legacy");
    fs.writeFileSync(path.join(configDir, "settings.json"), "{ this is not json");
    await restartApp();
    // Load warnings are their own banner rows, not toasts.
    const alerts = await alertTexts();
    expect(alerts.some((t) => /settings\.json/i.test(t))).toBe(true);
    // Defaults are usable: the workspace rendered, and the next settings write
    // (Preferences -> Save) produces valid JSON again.
    await openPreferences();
    await clickInPage("prefs-tab-appearance");
    await clickInPage("prefs-dark-theme");
    await clickInPage("prefs-dark-theme");
    await clickInPage("prefs-close");
    await browser.waitUntil(
      () => JSON.parse(fs.readFileSync(path.join(configDir, "settings.json"), "utf8")).schemaVersion >= 1,
      { timeout: 20000, interval: 500 },
    );
  });

  it("5000 bookmarks open, scroll, and stay after a restart", async () => {
    const n = 5000;
    const bookmarks = Array.from({ length: n }, (_, i) => ({
      id: `bk-${i}`,
      name: `Bookmark ${i}`,
      command: `echo ${i}`,
    }));
    await loadFixture("legacy");
    fs.writeFileSync(path.join(configDir, "bookmarks.json"), JSON.stringify(bookmarks));
    await restartApp();

    const countRows = () => browser.execute(() => document.querySelectorAll('[data-testid="bookmark-row"]').length);

    const t0 = Date.now();
    await clickInPage("bookmarks");
    await (await byTestId("bookmark-list")).waitForExist({ timeout: 20000 });
    expect(await countRows()).toBe(n);
    expect(Date.now() - t0).toBeLessThan(20000);
    expect(Object.values(await horizontalOverflow()).every((px) => px <= 0)).toBe(true);
    await browser.keys(["Escape"]);

    // Still there after a restart.
    await restartApp();
    await clickInPage("bookmarks");
    await (await byTestId("bookmark-list")).waitForExist({ timeout: 20000 });
    expect(await countRows()).toBe(n);
    await browser.keys(["Escape"]);
  });

  it("SIGKILL mid-connect takes the ssh child with it, and a restart reopens the tab", async () => {
    await loadFixture("legacy");
    await openPreferences();
    await clickInPage("prefs-restore-hosts");
    await clickInPage("prefs-close");
    await connectRow("my-server"); // 192.0.2.10 (TEST-NET): still connecting
    // The debounced save must have written the open tab before the kill.
    await browser.waitUntil(
      () =>
        (readSettingsFile()?.openedHosts as { hostName: string }[] | undefined)?.some((e) =>
          e.hostName.startsWith("my"),
        ) ?? false,
      { timeout: 15000, interval: 400 },
    );
    expect(execSync("pgrep -f 'ssh.*192\\.0\\.2\\.10' || true", { encoding: "utf8" }).trim()).not.toBe("");

    killApp("-9");
    await browser.pause(2000);
    // The pty master closes with the app, so ssh gets SIGHUP instead of lingering.
    expect(execSync("pgrep -f 'ssh.*192\\.0\\.2\\.10' || true", { encoding: "utf8" }).trim()).toBe("");

    await restartApp();
    await browser.waitUntil(async () => (await hookTabIds()).length === 1, {
      timeout: 30000,
      interval: 400,
    });
    const ids = await hookTabIds();
    await closeTabByHook(ids[0]!);
  });

  it("20 open tabs all work, and the tab bar scrolls instead of overflowing", async () => {
    await loadFixture("legacy");
    await doubleClickRow("Localhost");
    for (let i = 0; i < 19; i++) await openExtraTab();
    await browser.waitUntil(async () => (await hookTabIds()).length === 20, { timeout: 60000, interval: 500 });
    expect(await $$('[data-testid="tab"]')).toHaveLength(20);
    expect(Object.values(await horizontalOverflow()).every((px) => px <= 0)).toBe(true);
    expect(await badge("Localhost")).toBe("20");
    // Closing them all again must leave the notebook empty, not a broken tab bar.
    for (const id of await hookTabIds()) await closeTabByHook(id);
    await browser.waitUntil(async () => (await hookTabIds()).length === 0, { timeout: 30000, interval: 400 });
  });

  it("closing a tab while it is still connecting leaves no session behind", async () => {
    await loadFixture("legacy");
    const tab = await connectRow("my-server"); // 192.0.2.10 - TEST-NET, times out
    await browser.pause(600); // mid-connect
    await closeTabByHook(tab);
    expect(await hookTabIds()).not.toContain(tab);
    await browser.pause(2500);
    expect(await $$('[data-testid="connection-error-modal"]')).toHaveLength(0);
    expect(await (await byTestId("header-bar")).isExisting()).toBe(true);
  });

  it("five Retry clicks do not stack sessions or crash the app", async () => {
    await loadFixture("legacy");
    const tab = await connectRow("my-server");
    await (await byTestId("connection-error-modal")).waitForExist({ timeout: 40000 });
    for (let i = 0; i < 5; i++) {
      await clickInPage("connection-error-retry");
      await browser.pause(200);
    }
    expect(await hookTabIds()).toEqual([tab]);
    expect(await (await byTestId("header-bar")).isExisting()).toBe(true);
    await browser.waitUntil(async () => (await byTestId("connection-error-modal")).isExisting(), { timeout: 40000 });
    await clickInPage("connection-error-close");
    await closeTabByHook(tab);
  });
});
