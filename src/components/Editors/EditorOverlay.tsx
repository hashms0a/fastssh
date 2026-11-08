import { useAppStore } from "../../store/useAppStore";
import { strings } from "../../lib/strings";
import { useDialogFocus } from "../Modals/dialogFocus";
import type { EditorRequest } from "../../store/slices/uiSlice";
import { ConnectionEditor } from "./ConnectionEditor";
import { AccountEditor } from "./AccountEditor";

const titleOf = (editor: EditorRequest): string =>
  editor.kind === "host"
    ? editor.mode === "add"
      ? strings.editorNewConnection
      : strings.editorEditConnection
    : editor.mode === "add"
      ? strings.editorNewAccount
      : strings.editorEditAccount;

/**
 * Mounted only while an editor is open, so `useDialogFocus` really captures
 * the button that opened it: `EditorOverlay` itself stays in the tree and
 * returns null, which would make a hook there run once at app start.
 */
function EditorDialog({ editor }: { editor: EditorRequest }) {
  const { box, onKeyDown } = useDialogFocus<HTMLDivElement>();
  return (
    <div
      ref={box}
      data-testid="editor-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={titleOf(editor)}
      className="absolute inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center sm:p-8"
      onKeyDown={onKeyDown}
    >
      {editor.kind === "host" ? (
        <ConnectionEditor seed={editor.seed} mode={editor.mode} />
      ) : (
        <AccountEditor seed={editor.seed} mode={editor.mode} />
      )}
    </div>
  );
}

/**
 * Absolute overlay over the workspace driven by uiSlice.editor (task 3.4).
 * It never replaces the workspace, so host notebooks (Stage 4) stay
 * mounted behind it.
 *
 * Task 12.5: the overlay is a modal dialog - the first field takes focus on
 * open (`data-autofocus`), Tab stays inside, and focus returns to the control
 * that opened it. Escape is deliberately not an exit here: closing a
 * half-typed form would discard what the user wrote, so Cancel/Save are the
 * only ways out.
 */
export function EditorOverlay() {
  const editor = useAppStore((s) => s.editor);
  if (!editor) return null;
  return <EditorDialog key={`${editor.kind}:${editor.mode}:${editor.seed.id}`} editor={editor} />;
}
