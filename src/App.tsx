import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ipc, type RuntimeInfo } from "./lib/ipc";
import { strings } from "./lib/strings";
import { logError } from "./lib/log";

export default function App() {
  const [info, setInfo] = useState<RuntimeInfo | null>(null);

  useEffect(() => {
    ipc
      .getRuntimeInfo()
      .then(setInfo)
      .catch((e) => logError("get_runtime_info failed", e));
    void getCurrentWindow().show();
  }, []);

  return (
    <div className="flex h-screen flex-col bg-[var(--bg)] text-[var(--fg)]">
      <header
        data-testid="header-bar"
        className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-alt)] px-3 py-2"
      >
        <span className="font-semibold">{strings.appName}</span>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside data-testid="sidebar" className="w-60 shrink-0 border-r border-[var(--border)] bg-[var(--bg-alt)]" />
        <main className="flex min-w-0 flex-1 items-start justify-center p-6">
          <p data-testid="runtime-info" className="text-sm text-[var(--muted)]">
            {info
              ? strings.runtimeLine(info.version, info.desktop, info.session, info.appimage, info.dmabufDisabled)
              : "Loading…"}
          </p>
        </main>
      </div>
    </div>
  );
}
