import { useEffect } from "react";
import { useAppStore } from "../store/useAppStore";

/**
 * Window focus (task 6.7, R13): output in a background tab, or in the
 * foreground tab while the window is in the background, sets the unread dot.
 * Regaining focus clears the dot of the tab in front.
 */
export function useWindowFocus(): void {
  useEffect(() => {
    useAppStore.getState().setWindowFocused(document.hasFocus());
    const onFocus = () => {
      const st = useAppStore.getState();
      st.setWindowFocused(true);
      st.clearUnreadOfActiveTab(true);
    };
    const onBlur = () => useAppStore.getState().setWindowFocused(false);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
}
