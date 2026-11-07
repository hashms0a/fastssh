import { useEffect } from "react";
import { shortcutFor } from "../lib/shortcuts";
import { closeActiveTabOfSelectedHost, newTabForSelectedHost } from "../terminal/sessionController";

/**
 * Global key matrix (task 4.11). Registered on window so the terminal's own
 * textarea does not swallow the chord; Stage 6 completes the matrix (R17).
 */
export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = shortcutFor(e);
      if (!action) return;
      e.preventDefault();
      if (action === "new-tab") newTabForSelectedHost();
      else closeActiveTabOfSelectedHost();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
