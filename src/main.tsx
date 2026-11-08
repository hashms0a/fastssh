import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import { BootError } from "./components/BootError";
import { errorText } from "./lib/errorText";
import { ipc } from "./lib/ipc";
import { logError } from "./lib/log";
import { installTestHook } from "./lib/testHook";
import { useAppStore } from "./store/useAppStore";
import "./index.css";

async function boot() {
  const root = createRoot(document.getElementById("root")!);
  installTestHook(); // read-only e2e hook, DEV / mode "e2e" only
  try {
    const report = await ipc.loadAll(); // BEFORE first render
    useAppStore.getState().hydrate(report); // applies the theme
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  } catch (e) {
    // The boot error is on screen (BootError) and in the log for bug reports.
    logError("load_all failed at boot", e);
    root.render(<BootError error={errorText(e)} />);
  }
  await getCurrentWindow().show(); // Rust force-shows after 5 s anyway
}

void boot();
