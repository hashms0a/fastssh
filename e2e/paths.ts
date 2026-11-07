// Shared paths for cross-run snapshots (e2e/.tmp).
import path from "node:path";
export const tmpDir = path.join(__dirname, ".tmp");
export const prevFile = path.join(tmpDir, "prev-settings.json");
