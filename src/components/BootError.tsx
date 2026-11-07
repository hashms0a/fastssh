import { getCurrentWindow } from "@tauri-apps/api/window";
import { strings } from "../lib/strings";

/** Shown instead of a blank window when load_all fails before first render. */
export function BootError({ error }: { error: string }) {
  return (
    <div
      data-testid="boot-error"
      className="flex h-screen flex-col items-center justify-center gap-4 bg-[var(--bg)] p-8 text-[var(--fg)]"
    >
      <h1 className="text-lg font-semibold">{strings.bootErrorTitle}</h1>
      <p data-testid="boot-error-message" className="max-w-xl text-center text-sm text-[var(--muted)]">
        {error}
      </p>
      <button
        data-testid="boot-error-quit"
        type="button"
        className="rounded border border-[var(--border)] bg-[var(--bg-alt)] px-4 py-1.5 hover:bg-[var(--border)]"
        onClick={() => void getCurrentWindow().close()}
      >
        {strings.quit}
      </button>
    </div>
  );
}
