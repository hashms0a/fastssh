import { test, describe, expect } from "vitest";
import { naturalCompare, naturalSort } from "./naturalSort";

describe("naturalSort", () => {
  test("item2 sorts before item10 and db2 before db10", () => {
    expect(naturalCompare("item2", "item10")).toBeLessThan(0);
    expect(naturalCompare("db2", "db10")).toBeLessThan(0);
    expect(naturalSort(["db10", "db2", "db1"], (s) => s)).toEqual(["db1", "db2", "db10"]);
  });

  test("is case-insensitive", () => {
    expect(naturalCompare("Apple", "banana")).toBeLessThan(0);
    expect(naturalCompare("LAB", "lab")).toBe(0); // base sensitivity
  });

  test("handles Cyrillic", () => {
    expect(naturalCompare("Сервер-1", "Сервер-2")).toBeLessThan(0);
    expect(naturalCompare("Аа", "Яя")).toBeLessThan(0);
    expect(naturalSort(["Сервер-10", "Сервер-2"], (s) => s)).toEqual(["Сервер-2", "Сервер-10"]);
  });

  test("sorts records by an extracted key", () => {
    const rows = [{ name: "item10" }, { name: "item2" }];
    expect(naturalSort(rows, (r) => r.name).map((r) => r.name)).toEqual(["item2", "item10"]);
  });
});
