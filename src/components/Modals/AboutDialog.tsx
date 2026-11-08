import type { KeyboardEvent } from "react";
import { strings } from "../../lib/strings";
import type { RuntimeInfo } from "../../lib/ipc";
import { useAppStore } from "../../store/useAppStore";
import { primaryButtonClass } from "../Editors/fields";
import { useDialogFocus } from "./dialogFocus";

interface Props {
  info: RuntimeInfo | null;
}

/**
 * Task 8.6: what version this is, and the runtime line from Stage 0B that a
 * bug report needs. The same line the status bar shows (strings.runtimeLine).
 */
export function AboutDialog({ info }: Props) {
  const closeAbout = useAppStore((s) => s.closeAbout);
  const { box, onKeyDown } = useDialogFocus<HTMLDivElement>();

  const onPanelKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeAbout();
      return;
    }
    onKeyDown(e);
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div
        ref={box}
        data-testid="about-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={strings.about}
        onKeyDown={onPanelKeyDown}
        className="flex w-96 max-w-full flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-alt)] p-4 shadow-xl"
      >
        <h2 data-testid="about-title" className="text-lg font-semibold">
          {strings.appName}
        </h2>
        <p data-testid="about-version" className="text-sm">
          {info ? `v${info.version}` : strings.loading}
        </p>
        <p className="text-sm text-[var(--muted)]">{strings.aboutProject}</p>
        <p className="text-sm text-[var(--muted)]">{strings.aboutLicense}</p>
        <p data-testid="about-runtime" className="text-xs text-[var(--muted)]">
          {info
            ? strings.runtimeLine(info.version, info.desktop, info.session, info.appimage, info.dmabufDisabled)
            : strings.loading}
        </p>
        <p className="text-xs text-[var(--muted)]">{strings.aboutRuntimeHint}</p>
        <div className="flex justify-end">
          <button
            type="button"
            data-testid="about-close"
            data-autofocus
            className={primaryButtonClass}
            onClick={closeAbout}
          >
            {strings.close}
          </button>
        </div>
      </div>
    </div>
  );
}
