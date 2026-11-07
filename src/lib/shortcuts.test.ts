import { describe, expect, it } from "vitest";
import { shortcutFor, type KeyLike } from "./shortcuts";

const key = (over: Partial<KeyLike> = {}): KeyLike => ({
  key: "t",
  ctrlKey: true,
  shiftKey: true,
  altKey: false,
  metaKey: false,
  repeat: false,
  ...over,
});

describe("shortcutFor", () => {
  it("maps Ctrl+Shift+T and Ctrl+Shift+W", () => {
    expect(shortcutFor(key())).toBe("new-tab");
    expect(shortcutFor(key({ key: "T" }))).toBe("new-tab"); // CapsLock/shift casing
    expect(shortcutFor(key({ key: "w" }))).toBe("close-tab");
  });

  it("ignores auto-repeat (holding the chord does not spawn a burst)", () => {
    expect(shortcutFor(key({ repeat: true }))).toBeNull();
    expect(shortcutFor(key({ key: "w", repeat: true }))).toBeNull();
  });

  it("ignores chords without both modifiers and foreign modifiers", () => {
    expect(shortcutFor(key({ shiftKey: false }))).toBeNull();
    expect(shortcutFor(key({ ctrlKey: false }))).toBeNull();
    expect(shortcutFor(key({ altKey: true }))).toBeNull();
    expect(shortcutFor(key({ metaKey: true }))).toBeNull();
    expect(shortcutFor(key({ key: "x" }))).toBeNull();
  });
});
