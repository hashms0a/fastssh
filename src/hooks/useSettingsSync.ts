import { useEffect } from "react";
import { useAppStore } from "../store/useAppStore";
import { applyAppearance, applyTheme } from "../terminal/settingsSync";

/**
 * Task 8.1/8.2: a settings change takes effect at once, without waiting for
 * the debounced save. One subscription on the settings object; the theme
 * class is toggled first so the palette follows the same frame.
 */
export function useSettingsSync(): void {
  useEffect(() => {
    let previous = useAppStore.getState().settings;
    return useAppStore.subscribe((s) => {
      if (s.settings === previous) return;
      previous = s.settings;
      applyTheme(s.settings.useDarkTheme);
      applyAppearance(s.settings, s.hosts);
    });
  }, []);
}
