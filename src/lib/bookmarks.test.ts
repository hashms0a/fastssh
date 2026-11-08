import { describe, expect, it } from "vitest";
import type { Bookmark } from "../types/models";
import {
  addBookmark,
  errorsFor,
  filterBookmarks,
  normalizeBookmarkName,
  removeBookmark,
  validateBookmark,
} from "./bookmarks";

const b = (name: string, command: string, id = name): Bookmark => ({ id, name, command });

describe("validateBookmark (task 7.1)", () => {
  const all = [b("uptime", "uptime")];

  it("requires both fields", () => {
    expect(validateBookmark({ name: "", command: "" }, all).map((e) => e.messageKey)).toEqual([
      "nameRequired",
      "commandRequired",
    ]);
    expect(validateBookmark({ name: "  ", command: " df " }, all).map((e) => e.messageKey)).toEqual(["nameRequired"]);
    expect(validateBookmark({ name: "disk", command: "   " }, all).map((e) => e.messageKey)).toEqual([
      "commandRequired",
    ]);
  });

  it("rejects a name that is already taken, ignoring case-insensitive spacing", () => {
    expect(validateBookmark({ name: "uptime", command: "df" }, all).map((e) => e.messageKey)).toEqual(["nameTaken"]);
    expect(validateBookmark({ name: " uptime ", command: "df" }, all).map((e) => e.messageKey)).toEqual(["nameTaken"]);
    expect(validateBookmark({ name: "Uptime", command: "df" }, all), "names are case-sensitive").toEqual([]);
  });

  it("accepts a valid pair", () => {
    expect(validateBookmark({ name: "disk", command: "df -h" }, all)).toEqual([]);
  });

  it("errorsFor picks the field's message", () => {
    const errors = validateBookmark({ name: "uptime", command: "" }, all);
    expect(errorsFor(errors, "name").map((e) => e.messageKey)).toEqual(["nameTaken"]);
    expect(errorsFor(errors, "command").map((e) => e.messageKey)).toEqual(["commandRequired"]);
  });
});

describe("filterBookmarks (R3 search)", () => {
  const all = [b("uptime", "uptime"), b("disk", "df -h"), b("Сервер", "ls")];

  it("an empty query keeps every bookmark", () => {
    expect(filterBookmarks(all, "")).toEqual(all);
    expect(filterBookmarks(all, "   ")).toEqual(all);
  });

  it("matches the name and the command, case-insensitively", () => {
    expect(filterBookmarks(all, "DISK").map((x) => x.name)).toEqual(["disk"]);
    expect(
      filterBookmarks(all, "df").map((x) => x.name),
      "the command is searched too",
    ).toEqual(["disk"]);
    expect(filterBookmarks(all, "upt").map((x) => x.name)).toEqual(["uptime"]);
    expect(filterBookmarks(all, "сервер").map((x) => x.name)).toEqual(["Сервер"]);
    expect(filterBookmarks(all, "zzz")).toEqual([]);
  });
});

describe("addBookmark / removeBookmark", () => {
  it("adds a trimmed bookmark with an id, keeping the existing ones", () => {
    const list = addBookmark([b("uptime", "uptime")], "  my disk  ", "  df -h  ");
    expect(list).toHaveLength(2);
    const added = list[1]!;
    expect(added.name).toBe("my disk");
    expect(added.command).toBe("df -h");
    expect(added.id).toBeTruthy();
  });

  it("normalizeBookmarkName collapses runs of spaces", () => {
    expect(normalizeBookmarkName("  a   b  ")).toBe("a b");
  });

  it("removes by id only", () => {
    const list = [b("a", "x", "1"), b("b", "y", "2")];
    expect(removeBookmark(list, "1").map((x) => x.name)).toEqual(["b"]);
    expect(removeBookmark(list, "nope")).toEqual(list);
  });
});
