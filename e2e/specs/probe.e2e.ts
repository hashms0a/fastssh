import { byTestId } from "../helpers";

describe("probe", () => {
  it("tunnel row keys", async () => {
    await (await byTestId("new-connection")).click();
    await (await byTestId("tunnel-add")).click();
    await browser.pause(600);
    const sel = '[data-testid="tunnel-dest-host-0"]';
    const el = await $(sel);
    await el.click();
    await browser.keys(["Control", "a"]);
    await browser.keys(["Delete"]);
    for (const ch of "127.0.0.1 8080") await browser.keys([ch]);
    await browser.pause(400);
    console.log("P1 value", await (await $(sel)).getProperty("value"));
    console.log("P1 row", (await (await byTestId("tunnel-row-0")).getHTML()).slice(0, 700));
  });
});
