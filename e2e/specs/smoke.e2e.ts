import { expect } from "@wdio/globals";
import { byTestId, shot } from "../helpers";

describe("app smoke", () => {
  it("opens a FastSSH window with a header bar", async () => {
    await browser.pause(1500); // let the webview render
    await expect(browser).toHaveTitle("FastSSH");
    const header = await byTestId("header-bar");
    await expect(header).toBeExisting();
    await shot("stage_00", "e2e-smoke.png");
  });
});
