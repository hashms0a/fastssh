import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import { BootError } from "./components/BootError";
import { ipc } from "./lib/ipc";
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
    root.render(<BootError error={String(e)} />);
  }
  await getCurrentWindow().show(); // Rust force-shows after 5 s anyway
}

void boot();
