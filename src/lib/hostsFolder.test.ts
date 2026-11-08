import { describe, expect, it } from "vitest";
import { changeHostsFolder, type FolderFlowDeps } from "./hostsFolder";
import { folderModeFor } from "./prefs";
import { emptyReport } from "../test/ipcMock";
import type { AppSettings } from "../types/models";
import { DEFAULT_SETTINGS } from "../types/models";
import type { FolderMode, LoadReport } from "../lib/ipc";

const NEW_FOLDER = "/home/dev/data/hosts";

interface Calls {
  modes: FolderMode[];
  settings: Partial<AppSettings>[];
  reports: LoadReport[];
  toasts: Array<[string, string?]>;
  questions: string[];
}

function deps(calls: Calls, over: Partial<FolderFlowDeps> = {}): FolderFlowDeps {
  return {
    folder: NEW_FOLDER,
    hasLibrary: async () => false,
    confirm: async (_title, message) => {
      calls.questions.push(message);
      return true;
    },
    setFolder: async (folder, mode) => {
      calls.modes.push(mode);
      return emptyReport({ settings: { ...DEFAULT_SETTINGS, hostsFolder: folder } });
    },
    applyReport: (report) => calls.reports.push(report),
    updateSettings: (patch) => calls.settings.push(patch),
    toast: (message, kind) => calls.toasts.push([message, kind]),
    ...over,
  };
}

const fresh = (): Calls => ({ modes: [], settings: [], reports: [], toasts: [], questions: [] });

describe("changeHostsFolder (task 8.3)", () => {
  it("asks to load a folder that already has a library", async () => {
    const calls = fresh();
    const result = await changeHostsFolder(deps(calls, { hasLibrary: async () => true }));
    expect(calls.questions[0]).toContain(NEW_FOLDER);
    expect(calls.questions[0]).toMatch(/load the library/i);
    expect(calls.modes).toEqual(["load"]);
    expect(calls.reports).toHaveLength(1); // the library is replaced
    expect(calls.settings[0]?.hostsFolder).toBe(NEW_FOLDER); // and persisted
    expect(result).toBe("loaded");
  });

  it("asks to copy the current library into an empty folder", async () => {
    const calls = fresh();
    const result = await changeHostsFolder(deps(calls));
    expect(calls.questions[0]).toMatch(/copy the current library/i);
    expect(calls.modes).toEqual(["copy"]);
    expect(result).toBe("copied");
  });

  it("Cancel asks once and changes nothing", async () => {
    const calls = fresh();
    const result = await changeHostsFolder(deps(calls, { confirm: async () => false, hasLibrary: async () => true }));
    expect(calls.modes).toEqual([]);
    expect(calls.settings).toEqual([]);
    expect(calls.reports).toEqual([]);
    expect(result).toBe("cancelled");
  });

  it("a failed command reports the error and applies nothing", async () => {
    const calls = fresh();
    const result = await changeHostsFolder(
      deps(calls, {
        hasLibrary: async () => true,
        setFolder: async () => {
          throw { code: "no_library", message: `${NEW_FOLDER} contains no hosts.json.` };
        },
      }),
    );
    expect(calls.reports).toEqual([]);
    expect(calls.toasts[0]?.[1]).toBe("error");
    expect(calls.toasts[0]?.[0]).toContain("no hosts.json");
    expect(result).toBe("failed");
  });

  it("the mode follows what the folder contains", () => {
    expect(folderModeFor(true)).toBe("load");
    expect(folderModeFor(false)).toBe("copy");
  });
});
