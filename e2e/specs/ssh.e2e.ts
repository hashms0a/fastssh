import { execSync } from "node:child_process";
import { expect } from "@wdio/globals";
import {
  byTestId,
  clearKnownHosts,
  clickInPage,
  clickRow,
  connectRow,
  domTabIds,
  expectPrompt,
  expectText,
  expectRecentLine,
  landingVisible,
  knownHostLines,
  loadFixture,
  readBuffer,
  readConfigHosts,
  recentLines,
  resetSandbox,
  shot,
  runCommand,
  writeConfigHosts,
  writeCount,
} from "../helpers";

/**
 * Stage 5 acceptance: ssh in a tab against the fastssh-sshd container, the
 * password sent once before login, the fingerprint question, the error modal
 * with Retry, and a clean logout closing the tab.
 *
 * Order matters: test 1 answers the fingerprint question, which writes the
 * sandbox known_hosts that later tests rely on. Each test still restarts the
 * app (loadFixture + reloadSession), so no session leaks between them.
 */

const TEST_PASS = "fastssh-test-pass";

const passwordOf = (name: string): string => {
  const h = readConfigHosts().find((x) => x.name === name) as { password?: string } | undefined;
  return h?.password ?? "";
};

/** True once the sandbox sshd accepts a connection again. */
const portOpen = (port: number): boolean => {
  try {
    execSync(`bash -c 'exec 3<>/dev/tcp/127.0.0.1/${port} && exec 3>&-' 2>/dev/null`);
    return true;
  } catch {
    return false;
  }
};

const noModalWithin = async (ms: number): Promise<void> => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    expect(await $$('[data-testid="fingerprint-modal"], [data-testid="connection-error-modal"]')).toHaveLength(0);
    await browser.pause(250);
  }
};

/** The error dialog is the head of the dialog queue. */
const errorMessage = async (): Promise<string> => (await (await byTestId("connection-error-message")).getText()).trim();

describe("ssh connections + prompt heuristics (Stage 5)", () => {
  before(async () => {
    resetSandbox("legacy");
    clearKnownHosts();
    await browser.reloadSession();
    await (await byTestId("header-bar")).waitForExist();
  });

  after(() => {
    execSync("docker start fastssh-sshd");
  });

  // Test 1: R11 - the fingerprint modal, one password write, login, known_hosts.
  it("item10 asks for the fingerprint, then logs in with one password write", async () => {
    // before() emptied known_hosts; loadFixture restarts the app on the
    // legacy set so a retry of this test starts from a clean library too.
    clearKnownHosts();
    await loadFixture("legacy");
    const tab = await connectRow("item10");
    await (await byTestId("fingerprint-modal")).waitForExist({ timeout: 20000 });
    const text = await (await byTestId("fingerprint-text")).getText();
    expect(text).toMatch(/SHA256|MD5|SHA1|ED25519|ECDSA/i);
    await shot("stage_05", "fingerprint-modal.png");

    await clickInPage("fingerprint-yes");
    await expectPrompt(tab);

    await runCommand(tab, "whoami");
    await expectRecentLine(tab, "tester");

    // R11: the password went in exactly once, and it was the fixture's value.
    expect(await writeCount(tab, `${passwordOf("item10")}\n`)).toBe(1);

    await browser.waitUntil(async () => (await knownHostLines()).length === 1, { timeout: 8000, interval: 300 });
    expect(knownHostLines()[0]).toContain("127.0.0.1");

    await runCommand(tab, "exit");
    await browser.waitUntil(async () => (await domTabIds()).length === 0, { timeout: 10000, interval: 250 });
  });

  // Test 2: the second connect must not ask again (known_hosts now has the key).
  it("item10 again logs in without a fingerprint question", async () => {
    await loadFixture("legacy");
    expect(knownHostLines().length).toBeGreaterThan(0);
    const tab = await connectRow("item10");
    await noModalWithin(5000);
    await expectPrompt(tab);
    expect(await (await byTestId("fingerprint-modal")).isExisting()).toBe(false);
    expect(await writeCount(tab, `${TEST_PASS}\n`)).toBe(1);
  });

  // Test 3: R11 - the password is injected only before login.
  it("a password prompt after login gets no automatic password", async () => {
    await loadFixture("legacy");
    const tab = await connectRow("item10");
    await expectPrompt(tab);
    expect(await writeCount(tab, `${TEST_PASS}\n`)).toBe(1);

    // The container has no sudo, so the spec reproduces its exact prompt line
    // with an interactive read that leaves the terminal waiting at it.
    await runCommand(tab, "printf '[sudo] password for tester: '; read x");
    await browser.pause(2000);
    expect((await recentLines(tab, 3)).some((l) => l.endsWith("[sudo] password for tester:"))).toBe(true);
    expect(await writeCount(tab, `${TEST_PASS}\n`)).toBe(1);
  });

  // Test 4: R11/R10 - a clean logout closes the tab, the landing comes back.
  it("exit closes the remote tab and shows the landing card", async () => {
    await loadFixture("legacy");
    const tab = await connectRow("item10");
    await expectPrompt(tab);
    await runCommand(tab, "exit");
    await browser.waitUntil(async () => (await domTabIds()).length === 0, { timeout: 15000, interval: 250 });
    expect(await landingVisible()).toBe(true);
  });

  // Test 5: R2/R9 - item2 uses the account's identity file, no password.
  it("item2 logs in with the account key and shows no modal", async () => {
    await loadFixture("legacy");
    const tab = await connectRow("item2");
    await expectPrompt(tab, "keyuser");
    await runCommand(tab, "whoami");
    await expectRecentLine(tab, "keyuser");
    await noModalWithin(1500);
    expect(await writeCount(tab, `${TEST_PASS}\n`)).toBe(0);
  });

  // Test 6: R11 - the refused error, Retry in the same tab, Close removes it.
  it("Сервер-1 reports a refused connection; Retry shows one modal; Close closes the tab", async () => {
    await loadFixture("legacy");
    const tab = await connectRow("Сервер-1");
    await (await byTestId("connection-error-modal")).waitForExist({ timeout: 15000 });
    expect(await errorMessage()).toBe("Connection refused");
    expect(await (await byTestId("connection-error-line")).getText()).toContain("2299");

    await clickInPage("connection-error-retry");
    await browser.waitUntil(async () => (await $$('[data-testid="connection-error-modal"]')).length === 1, {
      timeout: 20000,
      interval: 300,
    });
    // Retry reconnects in the SAME tab (task 5.7), and only one dialog shows.
    expect(await domTabIds()).toEqual([tab]);
    expect(await $$('[data-testid="connection-error-modal"]')).toHaveLength(1);

    await clickInPage("connection-error-close");
    await browser.waitUntil(async () => (await domTabIds()).length === 0, { timeout: 8000, interval: 250 });
    expect(await landingVisible()).toBe(true);
  });

  // Test 7: R11 - the timeout case (TEST-NET address, ConnectTimeout=5).
  it("my-server reports a timeout within 10 s", async () => {
    await loadFixture("legacy");
    await connectRow("my-server");
    await (await byTestId("connection-error-modal")).waitForExist({ timeout: 12000 });
    expect(await errorMessage()).toBe("Connection timed out");
    await clickInPage("connection-error-close");
    expect(await domTabIds()).toHaveLength(0);
  });

  // Test 8: R9/R11 - ssh runs as a real process, and the password is not in argv.
  it("ssh runs with -p 2222 and no password on the command line", async () => {
    await loadFixture("legacy");
    const tab = await connectRow("item10");
    await expectPrompt(tab);

    const ps = execSync("ps -eo args", { encoding: "utf8" });
    const sshLines = ps.split("\n").filter((l) => /\bssh\b.*-p 2222/.test(l));
    expect(sshLines.length).toBeGreaterThan(0);
    expect(sshLines.some((l) => l.includes("tester@127.0.0.1"))).toBe(true);
    expect(ps).not.toContain(TEST_PASS);
  });

  // Test 9: R11 - a wrong password is sent once, then ssh reports auth failure.
  it("a wrong password is sent once and the auth modal appears", async () => {
    await loadFixture("legacy");
    const hosts = readConfigHosts();
    const item10 = hosts.find((h) => h.name === "item10") as Record<string, unknown>;
    const bad = { ...item10, name: "item10-wrong", password: "wrong" };
    writeConfigHosts([...hosts.filter((h) => h.name !== "item10-wrong"), bad]);
    await browser.reloadSession();
    await (await byTestId("header-bar")).waitForExist();

    const tab = await connectRow("item10-wrong");
    // One automatic attempt, then the spec types the same wrong value twice.
    await expectText(tab, "password:", 20000);
    expect(await writeCount(tab, "wrong\n")).toBe(1);

    // The two later attempts are typed by the spec, so the automatic count
    // stays 1: FastSSH never repeats the password (R11 "once").
    await runCommand(tab, "wrong");
    await expectText(tab, "Permission denied, please try again.");
    expect(await writeCount(tab, "wrong\n")).toBe(1);

    await runCommand(tab, "wrong");
    await (await byTestId("connection-error-modal")).waitForExist({ timeout: 20000 });
    expect(await errorMessage()).toBe("Authentication failed");
    expect(await writeCount(tab, "wrong\n")).toBe(1);

    await clickInPage("connection-error-close");
  });

  // Test 10 (last): the app survives losing the server mid-session.
  it("stopping the server ends the session and the app still responds", async () => {
    await loadFixture("legacy");
    const tab = await connectRow("item10");
    await expectPrompt(tab);

    execSync("docker stop fastssh-sshd");
    // R11/5.5: after login "Connection to X closed." is the normal goodbye, so
    // the tab either closes quietly, shows the dim exit line, or raises the
    // closed modal. Any of the three proves the app noticed and is alive.
    await browser.waitUntil(
      async () => {
        if ((await domTabIds()).length === 0) return true;
        if (await (await byTestId("connection-error-modal")).isExisting()) return true;
        const buffer = await readBuffer(tab);
        return buffer.includes("[Process exited with code") || buffer.includes("closed");
      },
      { timeout: 25000, interval: 500 },
    );

    if (await (await byTestId("connection-error-modal")).isExisting()) {
      expect(await errorMessage()).toBe("Connection closed");
      await clickInPage("connection-error-close");
    }
    // The window still answers: the landing card is there and a row is selectable.
    expect(await landingVisible()).toBe(true);
    await clickRow("item10");
    expect(await landingVisible()).toBe(true);

    execSync("docker start fastssh-sshd");
    await browser.waitUntil(() => portOpen(2222), { timeout: 20000, interval: 500 });
    const back = await connectRow("item10");
    await expectPrompt(back);
  });
});
