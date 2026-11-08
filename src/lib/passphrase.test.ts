import { describe, expect, it } from "vitest";
import { MIN_PASSPHRASE_LENGTH, checkPassphrase } from "./passphrase";

describe("checkPassphrase (task 10.4)", () => {
  it("accepts an 8-character passphrase with a matching confirmation", () => {
    expect(checkPassphrase("test-passphrase-1", { confirm: "test-passphrase-1" })).toBeNull();
    expect(checkPassphrase("abcdefgh")).toBeNull();
    expect(MIN_PASSPHRASE_LENGTH).toBe(8);
  });

  it("refuses empty, short, mismatched and newline passphrases", () => {
    expect(checkPassphrase("")).toBe("required");
    expect(checkPassphrase("abc")).toBe("tooShort");
    expect(checkPassphrase("abcdefgh", { confirm: "abcdefgh2" })).toBe("mismatch");
    // gpg reads the passphrase as one stdin line, so a newline desyncs it.
    expect(checkPassphrase("two\nlines")).toBe("newline");
    expect(checkPassphrase("two\rlines")).toBe("newline");
  });

  it("unlock and disable accept any length", () => {
    expect(checkPassphrase("abc", { minLength: 1 })).toBeNull();
    expect(checkPassphrase("", { minLength: 1 })).toBe("required");
    expect(checkPassphrase("a\nb", { minLength: 1 })).toBe("newline");
  });
});
