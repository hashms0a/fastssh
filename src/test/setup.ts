import "@testing-library/jest-dom/vitest";
import { mockIPC } from "@tauri-apps/api/mocks";

/** Reset the IPC mock with a minimal in-memory backend before each test. */
mockIPC((cmd) => {
  switch (cmd) {
    case "get_runtime_info":
      return {
        version: "1.0.0",
        desktop: "GNOME",
        session: "wayland",
        appimage: false,
        dmabuf_disabled: true,
      };
    default:
      return null;
  }
});
