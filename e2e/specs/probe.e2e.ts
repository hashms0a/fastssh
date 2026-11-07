import { byTestId, shot } from "../helpers";

describe("probe", () => {
  it("save selects the new host", async () => {
    await (await byTestId("new-connection")).click();
    await (await byTestId("connection-editor")).waitForExist();
    const name = `probe-${Date.now()}`;
    await (await byTestId("field-name")).setValue(name);
    await (await byTestId("field-host")).setValue("10.0.0.9");
    await (await byTestId("field-port")).setValue("22");
    await (await byTestId("editor-save")).click();
    await browser.pause(1500);
    await shot("stage_03", "probe-save-select.png");
    expect(await (await byTestId("landing-name")).getText()).toBe(name);
  });
});
