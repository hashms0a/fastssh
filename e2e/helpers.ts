import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const T = process.env.FASTSSH_TESTENV ?? path.join(os.homedir(), "fastssh-testenv");
/** The sandbox config dir the app under test uses (helpers.ts sets the env). */
export const configDir = process.env.FASTSSH_CONFIG_DIR ?? path.join(T, "config");
export const sshDir = process.env.FASTSSH_SSH_DIR ?? path.join(T, "ssh");

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

/** The sandbox hosts.json (a spec can add or edit a record before a reload). */
export function readConfigHosts(): Array<Record<string, unknown>> {
  const file = path.join(configDir, "hosts.json");
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
}

export function writeConfigHosts(hosts: readonly unknown[]): void {
  fs.writeFileSync(path.join(configDir, "hosts.json"), JSON.stringify(hosts));
}

/** Empties the sandbox known_hosts so ssh asks the fingerprint question. */
export function clearKnownHosts(): void {
  fs.writeFileSync(path.join(sshDir, "known_hosts"), "");
}

export function knownHostLines(): string[] {
  const file = path.join(sshDir, "known_hosts");
  return fs.existsSync(file)
    ? fs
        .readFileSync(file, "utf8")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
    : [];
}

/**
 * Terminal driving helpers, shared by the Stage 4-10 specs. Terminal state is
 * read through window.__fastsshTest (tools/build-debug.sh, Vite mode "e2e"),
 * never from a screenshot. Keys go through browser.keys after focusing the
 * xterm textarea, and clicks are dispatched in the page because a W3C click
 * on XWayland is sometimes reported before the page acted.
 */

declare global {
  interface Window {
    __fastsshTest?: {
      getText(tabId: string): string;
      activeTabId(): string | null;
      cols(tabId: string): number;
      bufferLength(tabId: string): number;
      tabIds(): string[];
      writeCount(tabId: string, text: string): number;
    };
    __TAURI_INTERNALS__?: { invoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> };
  }
}

export const readBuffer = async (tabId: string): Promise<string> =>
  (await browser.execute((id) => window.__fastsshTest?.getText(id) ?? "", tabId)) as string;

export const readCols = async (tabId: string): Promise<number> =>
  (await browser.execute((id) => window.__fastsshTest?.cols(id) ?? 0, tabId)) as number;

export const writeCount = async (tabId: string, text: string): Promise<number> =>
  (await browser.execute((id, t) => window.__fastsshTest?.writeCount(id, t) ?? 0, tabId, text)) as number;

export const hookTabIds = async (): Promise<string[]> =>
  (await browser.execute(() => window.__fastsshTest?.tabIds() ?? [])) as string[];

export const domTabIds = async (): Promise<string[]> => {
  const ids: string[] = [];
  for (const el of await $$('[data-testid="tab"]')) ids.push((await el.getAttribute("data-tab-id")) ?? "");
  return ids;
};

/**
 * Login finished: a shell prompt of the shape `user@host:~#`. The shape
 * matters — the echoed `exec ssh … user@127.0.0.1` line names the user too,
 * so a plain needle would pass before ssh is through.
 */
export async function expectPrompt(tabId: string, user = "tester", timeout = 20000): Promise<void> {
  const re = new RegExp(`${user}@[^\\s]+:\\S*[#$]`);
  await browser.waitUntil(async () => re.test(await readBuffer(tabId)), { timeout, interval: 300 });
}

export async function expectText(tabId: string, needle: string, timeout = 12000): Promise<void> {
  await browser.waitUntil(async () => (await readBuffer(tabId)).includes(needle), { timeout, interval: 300 });
}

/** The last few non-empty buffer lines, where a fresh command's answer sits. */
export async function recentLines(tabId: string, n = 4): Promise<string[]> {
  const lines = (await readBuffer(tabId))
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.slice(-n);
}

export async function expectRecentLine(tabId: string, value: string, timeout = 12000): Promise<void> {
  await browser.waitUntil(async () => (await recentLines(tabId)).includes(value), { timeout, interval: 300 });
}

/** Focus the tab's xterm textarea; a click on the pane can be swallowed. */
export async function focusTerm(tabId: string): Promise<void> {
  await browser.execute((id) => {
    const pane = document.querySelector(`[data-testid="terminal-pane"][data-tab-id="${id}"]`);
    const ta = pane?.querySelector(".xterm-helper-textarea") as HTMLTextAreaElement | null;
    ta?.focus();
  }, tabId);
  await browser.pause(120);
}

/** Make a tab the visible one; a hidden pane's textarea cannot take focus. */
export async function selectTab(tabId: string): Promise<void> {
  await browser.execute((id) => {
    document
      .querySelector(`[data-testid="tab"][data-tab-id="${id}"]`)
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }, tabId);
  await browser.waitUntil(
    async () => (await browser.execute(() => window.__fastsshTest?.activeTabId() ?? null)) === tabId,
    { timeout: 6000, interval: 200 },
  );
  await browser.pause(250);
}

/** Type a command line into the terminal, like a user would. */
export async function runCommand(tabId: string, line: string): Promise<void> {
  await focusTerm(tabId);
  for (const ch of line) await browser.keys([ch === " " ? "Space" : ch]);
  await browser.keys(["Enter"]);
}

/** The names of the sidebar rows the app marks selected (read one by one:
 * the driver's CSS engine mishandles a combined attribute selector). */
export async function selectedRowNames(): Promise<string[]> {
  const out: string[] = [];
  for (const el of await $$('[data-testid="host-row"]')) {
    if ((await el.getAttribute("aria-selected")) === "true") out.push((await el.getAttribute("data-name")) ?? "");
  }
  return out;
}

export async function clickRow(name: string): Promise<void> {
  const sel = `[data-testid="host-row"][data-name="${name}"]`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const el = await $(sel);
    await el.waitForExist();
    try {
      await el.click();
    } catch {
      await browser.execute((n) => {
        const row = [...document.querySelectorAll<HTMLElement>('[data-testid="host-row"]')].find(
          (e) => e.getAttribute("data-name") === n,
        );
        row?.click();
      }, name);
    }
    await browser.pause(350);
    if ((await el.getAttribute("aria-selected")) === "true") return;
  }
}

export async function doubleClickRow(name: string): Promise<void> {
  const before = (await domTabIds()).length;
  for (let attempt = 0; attempt < 3; attempt++) {
    const el = await $(`[data-testid="host-row"][data-name="${name}"]`);
    await el.waitForExist();
    try {
      await el.doubleClick();
    } catch {
      await browser.execute((n) => {
        const row = [...document.querySelectorAll<HTMLElement>('[data-testid="host-row"]')].find(
          (e) => e.getAttribute("data-name") === n,
        );
        row?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      }, name);
    }
    await browser.pause(500);
    if ((await domTabIds()).length > before) return;
  }
  await (await byTestId("notebook")).waitForExist();
}

export async function openExtraTab(): Promise<void> {
  const before = (await domTabIds()).length;
  await (await byTestId("tab-new")).click();
  await browser.waitUntil(async () => (await domTabIds()).length === before + 1, { timeout: 8000, interval: 250 });
}

export async function badge(name: string): Promise<string> {
  const el = await $(`[data-testid="host-row"][data-name="${name}"] [data-testid="host-row-badge"]`);
  return (await el.isExisting()) ? await el.getText() : "";
}

export const landingVisible = async (): Promise<boolean> => (await byTestId("landing-connect")).isExisting();

/**
 * Open a tab for a host in the sidebar: select the row, then press Connect.
 * The Connect press is dispatched inside the page because a W3C click here
 * sometimes never returns under the tauri driver's window-focus hook.
 */
export async function connectRow(name: string): Promise<string> {
  await clickRow(name);
  const button = await byTestId("landing-connect");
  await button.waitForExist({ timeout: 6000 });
  await browser.execute(() => {
    (document.querySelector('[data-testid="landing-connect"]') as HTMLElement | null)?.click();
  });
  await browser.waitUntil(async () => (await hookTabIds()).length > 0, { timeout: 10000, interval: 250 });
  return (await hookTabIds())[0]!;
}

/** Click a testid inside the page (no W3C click round trip). */
export async function clickInPage(testId: string, timeout = 15000): Promise<void> {
  await (await byTestId(testId)).waitForExist({ timeout });
  await browser.execute((id) => {
    (document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null)?.click();
  }, testId);
  await browser.pause(300);
}

/** Quit the app from inside the webview. */
export async function quitApp(): Promise<void> {
  await browser.execute(() => void window.__TAURI_INTERNALS__?.invoke("quit_app"));
  await browser.pause(1200);
}
