import { strings } from "../lib/strings";
import { useAppStore } from "../store/useAppStore";

/**
 * Bottom-right toasts (task 2.12): role="status" for info (auto-dismiss
 * 6 s), role="alert" for errors (persist). The Stage 1 corrupt-file
 * warnings banner moved onto toasts (one alert per warning).
 */
export function Toasts() {
  const toasts = useAppStore((s) => s.toasts);
  const warnings = useAppStore((s) => s.warnings);
  const dismissToast = useAppStore((s) => s.dismissToast);
  const dismissWarnings = useAppStore((s) => s.dismissWarnings);

  if (toasts.length === 0 && warnings.length === 0) return null;

  return (
    <div data-testid="toasts" className="fixed bottom-4 right-4 z-40 flex max-w-md flex-col items-end gap-2">
      {warnings.map((w) => (
        <div
          key={`w:${w}`}
          data-testid="warning-line"
          role="alert"
          className="flex items-start gap-3 rounded-md bg-[var(--danger)] px-3 py-2 text-sm text-white shadow-lg"
        >
          <span className="min-w-0 break-words">{w}</span>
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
      ))}
      {toasts.map((t) => (
        <div
          key={t.id}
          data-testid="toast"
          role={t.kind === "error" ? "alert" : "status"}
          className={`flex items-start gap-3 rounded-md px-3 py-2 text-sm shadow-lg ${
            t.kind === "error"
              ? "bg-[var(--danger)] text-white"
              : "bg-[var(--bg-alt)] text-[var(--fg)] border border-[var(--border)]"
          }`}
        >
          <span className="min-w-0 break-words">{t.message}</span>
          <button
            type="button"
            data-testid="toast-dismiss"
            aria-label={strings.dismiss}
            className="shrink-0 rounded border border-current/30 px-2 hover:opacity-70"
            onClick={() => dismissToast(t.id)}
          >
            {strings.dismiss}
          </button>
        </div>
      ))}
    </div>
  );
}
