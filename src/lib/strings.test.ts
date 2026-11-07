import { describe, expect, it } from "vitest";
import { strings } from "./strings";

describe("strings", () => {
  it("has the app name", () => {
    expect(strings.appName).toBe("FastSSH");
  });

  it("formats the runtime info line", () => {
    expect(strings.runtimeLine("1.0.0", "GNOME", "wayland", false, true)).toBe(
      "FastSSH 1.0.0 - GNOME/wayland - AppImage: no - DMABUF disabled: yes",
    );
    expect(strings.runtimeLine("1.0.0", "KDE", "x11", true, false)).toBe(
      "FastSSH 1.0.0 - KDE/x11 - AppImage: yes - DMABUF disabled: no",
    );
  });
});
