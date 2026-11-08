import { useEffect } from "react";
import { logError } from "../lib/log";
import { quitNow } from "../lib/quitActions";
import { needsSearchOpen, shortcutFor, type ShortcutAction } from "../lib/shortcuts";
import { toggleFullscreen } from "../lib/windowOps";
import { useAppStore, type AppStore } from "../store/useAppStore";
import { closeActiveTabOfSelectedHost, newTabForSelectedHost } from "../terminal/sessionController";
import {
  copyLastOutput,
  copySelection,
  pasteFromClipboard,
  scrollLastCommand,
  selectAllTerminal,
  showFileBrowser,
} from "../terminal/terminalActions";
import { stepSearch, toggleSearch } from "../terminal/searchController";

/**
 * The global key matrix (spec section 9, tasks 6.1/6.2, R17). Registered on
 * window; xterm ignores the same chords through attachCustomKeyEventHandler,
 * so nothing reaches the shell. Ctrl+G / Ctrl+Shift+G are the shell's own
 * keys while the search toolbar is closed, so they are not swallowed.
 */
function run(action: ShortcutAction, st: AppStore): void {
  const hostId = st.selectedHostId;
  switch (action) {
    case "quit":
      // Task 8.4: openedHosts + flush first, then quit_app (which kills the PTYs).
      void quitNow();
      break;
    case "new-tab":
      newTabForSelectedHost();
      break;
    case "close-tab":
      closeActiveTabOfSelectedHost();
      break;
    case "prev-tab":
      if (hostId) st.cycleActiveTab(hostId, -1);
      break;
    case "next-tab":
      if (hostId) st.cycleActiveTab(hostId, 1);
      break;
    case "copy":
      void copySelection();
      break;
    case "paste":
      void pasteFromClipboard();
      break;
    case "select-all":
      selectAllTerminal();
      break;
    case "search":
      toggleSearch();
      break;
    case "search-next":
      stepSearch("next");
      break;
    case "search-prev":
      stepSearch("prev");
      break;
    case "file-browser":
      showFileBrowser();
      break;
    case "copy-last-output":
      copyLastOutput();
      break;
    case "scroll-last-command":
      scrollLastCommand();
      break;
    case "fullscreen":
      toggleFullscreen().catch((e) => logError("set_fullscreen failed", e));
      break;
  }
}

export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = shortcutFor(e);
      if (!action) return;
      const st = useAppStore.getState();
      if (needsSearchOpen(action) && !st.searchOpen) return;
      e.preventDefault();
      run(action, st);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
