/**
 * Text of a rejected IPC call. A Rust `AppError` arrives as
 * `{ code, message }`, a mocked/JS rejection as a string; `String(e)` alone
 * would print "[object Object]" in a toast.
 */
export function errorText(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message: unknown }).message;
    if (typeof m === "string" && m) return m;
  }
  return String(e);
}
