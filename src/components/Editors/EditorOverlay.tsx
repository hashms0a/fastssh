import { useAppStore } from "../../store/useAppStore";
import { ConnectionEditor } from "./ConnectionEditor";
import { AccountEditor } from "./AccountEditor";

/**
 * Absolute overlay over the workspace driven by uiSlice.editor (task 3.4).
 * It never replaces the workspace, so host notebooks (Stage 4) stay
 * mounted behind it.
 */
export function EditorOverlay() {
  const editor = useAppStore((s) => s.editor);
  if (!editor) return null;
  return (
    <div
      data-testid="editor-overlay"
      className="absolute inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/30 p-4 sm:items-center sm:p-8"
    >
      {editor.kind === "host" ? (
        <ConnectionEditor seed={editor.seed} mode={editor.mode} />
      ) : (
        <AccountEditor seed={editor.seed} mode={editor.mode} />
      )}
    </div>
  );
}
