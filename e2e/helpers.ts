import path from "node:path";
import os from "node:os";

const T = process.env.FASTSSH_TESTENV ?? path.join(os.homedir(), "fastssh-testenv");
/** The sandbox config dir the app under test uses (helpers.ts sets the env). */
export const configDir = process.env.FASTSSH_CONFIG_DIR ?? path.join(T, "config");

/** Save a screenshot into docs/screenshots/<stage>/<name>.png */
export async function shot(stageDir: string, name: string): Promise<void> {
  const file = path.join(__dirname, "..", "docs", "screenshots", stageDir, name);
  await browser.saveScreenshot(file);
}

export const byTestId = (id: string) => $(`[data-testid="${id}"]`);
