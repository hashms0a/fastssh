import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ipc, type RuntimeInfo } from "./lib/ipc";
import { strings } from "./lib/strings";
import { logError } from "./lib/log";
import { useWindowState } from "./hooks/useWindowState";
import { useCloseHandler } from "./hooks/useCloseHandler";
import { useAppStore } from "./store/useAppStore";

export default function App() {
  const [info, setInfo] = useState<RuntimeInfo | null>(null);
  const warnings = useAppStore((s) => s.warnings);
  const dismissWarnings = useAppStore((s) => s.dismissWarnings);
  useWindowState();
  useCloseHandler();

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
      {warnings.length > 0 && (
        <div
          data-testid="warnings-banner"
          role="alert"
          className="flex items-start justify-between gap-4 border-b border-[var(--border)] bg-[var(--danger,#8b3a3a)] px-3 py-2 text-sm text-white"
        >
          <ul className="min-w-0 space-y-0.5">
            {warnings.map((w) => (
              <li key={w} data-testid="warning-line" className="truncate">
                {w}
              </li>
            ))}
          </ul>
          <button
            type="button"
            data-testid="warnings-dismiss"
            aria-label={strings.dismiss}
            className="shrink-0 rounded border border-white/30 px-2 hover:bg-white/10"
            onClick={dismissWarnings}
          >
            {strings.dismiss}
          </button>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <aside data-testid="sidebar" className="w-60 shrink-0 border-r border-[var(--border)] bg-[var(--bg-alt)]" />
        <main className="flex min-w-0 flex-1 items-start justify-center p-6">
          <p data-testid="runtime-info" className="text-sm text-[var(--muted)]">
            {info
              ? strings.runtimeLine(info.version, info.desktop, info.session, info.appimage, info.dmabufDisabled)
              : strings.loading}
          </p>
        </main>
      </div>
    </div>
  );
}
