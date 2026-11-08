/**
 * Pure bookmark rules (task 7.1, R3): the popover's search, the Add form's
 * validation, and the list edits. No React, no IPC — the store does the save.
 */
import type { Bookmark } from "../types/models";
import { newId } from "./ids";
import type { ValidationKey } from "./strings";

export type BookmarkField = "name" | "command";

export interface BookmarkError {
  field: BookmarkField;
  messageKey: ValidationKey;
}

/** Names are compared trimmed; the stored value keeps what the user typed. */
export const normalizeBookmarkName = (name: string): string => name.trim().replace(/\s+/g, " ");

export function validateBookmark(draft: { name: string; command: string }, all: readonly Bookmark[]): BookmarkError[] {
  const errors: BookmarkError[] = [];
  const name = normalizeBookmarkName(draft.name);
  if (!name) errors.push({ field: "name", messageKey: "nameRequired" });
  else if (all.some((b) => normalizeBookmarkName(b.name) === name))
    errors.push({ field: "name", messageKey: "nameTaken" });
  if (!draft.command.trim()) errors.push({ field: "command", messageKey: "commandRequired" });
  return errors;
}

export function errorsFor(errors: readonly BookmarkError[], field: BookmarkField): BookmarkError[] {
  return errors.filter((e) => e.field === field);
}

/** R3: the search field filters on the name AND the command. */
export function filterBookmarks(all: readonly Bookmark[], query: string): Bookmark[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...all];
  return all.filter((b) => b.name.toLowerCase().includes(q) || b.command.toLowerCase().includes(q));
}

export function addBookmark(all: readonly Bookmark[], name: string, command: string): Bookmark[] {
  return [...all, { id: newId(), name: normalizeBookmarkName(name), command: command.trim() }];
}

export function removeBookmark(all: readonly Bookmark[], id: string): Bookmark[] {
  return all.filter((b) => b.id !== id);
}
