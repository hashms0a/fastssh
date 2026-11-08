import { useEffect, useState } from "react";
import { ipc, type RuntimeInfo } from "./lib/ipc";
import { strings } from "./lib/strings";
import { logError } from "./lib/log";
import { useWindowState } from "./hooks/useWindowState";
import { useWindowFocus } from "./hooks/useWindowFocus";
import { useCloseHandler } from "./hooks/useCloseHandler";
import { useSettingsSync } from "./hooks/useSettingsSync";
import { useRestoreTabs } from "./hooks/useRestoreTabs";
import { useShortcuts } from "./hooks/useShortcuts";
import { useAppStore } from "./store/useAppStore";
import { HeaderBar } from "./components/HeaderBar";
import { SourceListView } from "./components/Sidebar/SourceListView";
import { Splitter } from "./components/Splitter";
import { Workspace } from "./components/Workspace/Workspace";
import { EditorOverlay } from "./components/Editors/EditorOverlay";
import { ModalHost } from "./components/Modals/ModalHost";
import { GpgPasswordModal } from "./components/Modals/GpgPasswordModal";
import { PreferencesModal } from "./components/Modals/PreferencesModal";
import { AboutDialog } from "./components/Modals/AboutDialog";
import { Toasts } from "./components/Toasts";

export default function App() {
  const [info, setInfo] = useState<RuntimeInfo | null>(null);
  const panelSize = useAppStore((s) => s.settings.panelSize);
  const preferencesOpen = useAppStore((s) => s.preferencesOpen);
  const aboutOpen = useAppStore((s) => s.aboutOpen);
  // Stage 10: `locked` (a *.json.gpg with no passphrase) forces unlock mode.
  const locked = useAppStore((s) => s.locked);
  const passModal = useAppStore((s) => s.passModal);
  useWindowState();
  useWindowFocus();
  useCloseHandler();
  useSettingsSync();
  useRestoreTabs();
  useShortcuts();

  useEffect(() => {
    ipc
      .getRuntimeInfo()
      .then(setInfo)
      .catch((e) => logError("get_runtime_info failed", e));
  }, []);

  return (
    <div className="relative flex h-screen flex-col bg-[var(--bg)] text-[var(--fg)]">
      <HeaderBar />
      <div className="flex min-h-0 flex-1">
        <aside
          data-testid="sidebar"
          style={{ width: panelSize }}
          className="shrink-0 border-r border-[var(--border)] bg-[var(--bg-alt)]"
        >
          <SourceListView />
        </aside>
        <Splitter />
        <main className="relative flex min-w-0 flex-1 flex-col">
          <Workspace />
          {/* Editors float over the workspace; notebooks stay mounted. */}
          <EditorOverlay />
          <p
            data-testid="runtime-info"
            className="border-t border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)]"
          >
            {info
              ? strings.runtimeLine(info.version, info.desktop, info.session, info.appimage, info.dmabufDisabled)
              : strings.loading}
          </p>
        </main>
      </div>
      {locked ? <GpgPasswordModal mode="unlock" /> : passModal ? <GpgPasswordModal mode={passModal} /> : null}
      <ModalHost />
      {/* Stage 8 overlays; the workspace and notebooks stay mounted behind. */}
      {preferencesOpen && <PreferencesModal />}
      {aboutOpen && <AboutDialog info={info} />}
      <Toasts />
    </div>
  );
}
