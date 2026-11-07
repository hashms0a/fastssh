import path from "node:path";

/** Save a screenshot into docs/screenshots/<stage>/<name>.png */
export async function shot(stageDir: string, name: string): Promise<void> {
  const file = path.join(__dirname, "..", "docs", "screenshots", stageDir, name);
  await browser.saveScreenshot(file);
}

export const byTestId = (id: string) => $(`[data-testid="${id}"]`);
