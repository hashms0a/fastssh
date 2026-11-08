import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { strings } from "../lib/strings";
import { addBookmark, errorsFor, filterBookmarks, removeBookmark, validateBookmark } from "../lib/bookmarks";
import { useAppStore } from "../store/useAppStore";
import { runBookmark } from "../terminal/terminalActions";
import { FieldMessage, buttonClass, inputClass, primaryButtonClass } from "./Editors/fields";

interface Props {
  x: number;
  y: number;
  onClose: () => void;
}

/**
 * Bookmarks popover (task 7.1, R3): the search field filters on the name and
 * the command, every row has Run and Delete, and the Add form below needs
 * both fields and a name that is not taken. Run writes "<command>\n" into the
 * active tab of the selected host; with no open tab it is disabled with the
 * "Open a terminal first" tooltip. Escape and an outside click close it.
 */
export function BookmarksPopover({ x, y, onClose }: Props) {
  const bookmarks = useAppStore((s) => s.bookmarks);
  const saveBookmarks = useAppStore((s) => s.saveBookmarks);
  const confirm = useAppStore((s) => s.confirm);
  // R3: Run needs a live tab in the selected host's notebook.
  const canRun = useAppStore((s) =>
    s.selectedHostId ? (s.activeTabByHost[s.selectedHostId] ?? null) !== null : false,
  );

  const box = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState({ name: "", command: "" });
  const [showErrors, setShowErrors] = useState(false);
  const [pos, setPos] = useState({ left: x, top: y });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      // Task 12.5: while the popover is open, Tab stays inside it. The header
      // button restores focus when it closes.
      if (e.key === "Tab" && box.current?.contains(document.activeElement ?? null)) {
        const items = [...box.current.querySelectorAll<HTMLElement>("button, [href], input, select, textarea")];
        const first = items[0];
        const last = items[items.length - 1];
        if (!first || !last) return;
        const active = document.activeElement;
        if ((e.shiftKey && active === first) || (!e.shiftKey && active === last)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        }
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) onClose();
    };
    // Capture phase: xterm consumes keys when a terminal is focused.
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointer, true);
    box.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointer, true);
    };
  }, [onClose]);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      left: Math.max(0, Math.min(x, window.innerWidth - rect.width)),
      top: Math.max(0, Math.min(y, window.innerHeight - rect.height)),
    });
  }, [x, y]);

  const errors = validateBookmark(draft, bookmarks);
  const nameError = errorsFor(errors, "name")[0];
  const commandError = errorsFor(errors, "command")[0];
  const rows = filterBookmarks(bookmarks, query);

  const submit = (): void => {
    if (errors.length > 0) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    const next = addBookmark(bookmarks, draft.name, draft.command);
    setDraft({ name: "", command: "" });
    void saveBookmarks(next);
  };

  const remove = async (id: string, name: string): Promise<void> => {
    const ok = await confirm({ title: strings.bookmarks, message: strings.removeBookmarkConfirm(name) });
    if (ok) await saveBookmarks(removeBookmark(bookmarks, id));
  };

  const run = (command: string): void => {
    runBookmark(command);
    onClose();
  };

  return (
    <div
      ref={box}
      data-testid="bookmarks-popover"
      role="dialog"
      aria-modal="true"
      aria-label={strings.bookmarks}
      style={{ left: pos.left, top: pos.top }}
      className="fixed z-50 flex w-96 max-w-[92vw] flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-alt)] p-3 shadow-xl"
    >
      <input
        type="text"
        data-testid="bookmark-search"
        data-autofocus
        aria-label={strings.bookmarkSearch}
        placeholder={strings.bookmarkSearch}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className={inputClass}
      />

      <div data-testid="bookmark-list" className="flex max-h-64 flex-col gap-1 overflow-y-auto">
        {rows.length === 0 && (
          <p data-testid="bookmark-empty" className="px-1 py-2 text-sm text-[var(--muted)]">
            {bookmarks.length === 0 ? strings.bookmarkNone : strings.bookmarkNoMatch}
          </p>
        )}
        {rows.map((b) => (
          <div
            key={b.id}
            data-testid="bookmark-row"
            data-name={b.name}
            className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-[var(--bg)]"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{b.name}</p>
              <p className="truncate font-mono text-xs text-[var(--muted)]">{b.command}</p>
            </div>
            <button
              type="button"
              data-testid="bookmark-run"
              className={buttonClass}
              disabled={!canRun}
              title={canRun ? undefined : strings.openTerminalFirst}
              onClick={() => run(b.command)}
            >
              {strings.bookmarkRun}
            </button>
            <button
              type="button"
              data-testid="bookmark-delete"
              aria-label={strings.bookmarkDeleteFor(b.name)}
              className={buttonClass}
              onClick={() => void remove(b.id, b.name)}
            >
              {strings.bookmarkDelete}
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1.5 border-t border-[var(--border)] pt-2">
        <input
          type="text"
          data-testid="bookmark-name"
          aria-label={strings.bookmarkName}
          placeholder={strings.bookmarkName}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          className={inputClass}
        />
        <FieldMessage
          testId="bookmark-name-error"
          message={showErrors && nameError ? strings.validation[nameError.messageKey] : undefined}
        />
        <input
          type="text"
          data-testid="bookmark-command"
          aria-label={strings.bookmarkCommand}
          placeholder={strings.bookmarkCommand}
          value={draft.command}
          onChange={(e) => setDraft({ ...draft, command: e.target.value })}
          className={inputClass}
        />
        <FieldMessage
          testId="bookmark-command-error"
          message={showErrors && commandError ? strings.validation[commandError.messageKey] : undefined}
        />
        <div className="flex justify-end">
          <button type="button" data-testid="bookmark-add" className={primaryButtonClass} onClick={submit}>
            {strings.bookmarkAdd}
          </button>
        </div>
      </div>
    </div>
  );
}
