import { byTestId, shot } from "../helpers";

describe("probe", () => {
  it("save closes the editor", async () => {
    await (await byTestId("new-connection")).click();
    await (await byTestId("connection-editor")).waitForExist();
    await (await byTestId("field-name")).setValue(`probe-${Date.now()}`);
    await (await byTestId("field-host")).setValue("10.0.0.9");
    await (await byTestId("editor-save")).click();
    await browser.pause(2500);
    await shot("stage_03", "probe-after-save.png");
    expect(await (await byTestId("landing-name")).getText()).toContain("probe-");
  });
});
