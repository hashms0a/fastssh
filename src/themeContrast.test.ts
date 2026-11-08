import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Read from disk, not through Vite: the CSS pipeline would rewrite the file. */
const css = readFileSync(join(process.cwd(), "src/index.css"), "utf8");

/**
 * Task 12.5: the palette in `src/index.css` is the only source of colours
 * (plan rule 8), so the WCAG ratios are asserted against the file itself
 * rather than against a copy of the numbers. Text pairs need 4.5:1, borders
 * and the focus ring need 3:1 (WCAG 1.4.3 / 1.4.11), in both themes.
 */

function palette(selector: string): Record<string, string> {
  const block = new RegExp(`^${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`, "m").exec(css);
  if (!block) throw new Error(`no ${selector} block in index.css`);
  const out: Record<string, string> = {};
  for (const [, name, value] of block[1]!.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    out[name!] = value!;
  }
  return out;
}

const channel = (h: string): number => {
  const v = parseInt(h, 16) / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};

const luminance = (hex: string): number => {
  const r = hex.slice(1, 3);
  const g = hex.slice(3, 5);
  const b = hex.slice(5, 7);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

export const contrast = (a: string, b: string): number => {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

describe("theme contrast (task 12.5)", () => {
  const themes: Record<string, string> = { light: ":root", dark: ".dark" };
  const textPairs: [string, string, string][] = [
    ["--fg", "--bg", "body text"],
    ["--fg", "--bg-alt", "text on panels/toasts"],
    ["--muted", "--bg", "muted text"],
    ["--muted", "--bg-alt", "muted text on panels"],
    ["--accent", "--bg", "app name, links"],
    ["--accent", "--bg-alt", "accent text on panels"],
    ["--danger", "--bg", "field error text"],
    ["--on-accent", "--accent", "label on a selected row / primary button"],
    ["--on-danger", "--danger", "label on an error toast"],
  ];
  const uiPairs: [string, string, string][] = [
    ["--border", "--bg", "input border, divider"],
    ["--border", "--bg-alt", "input border on panels"],
    ["--accent", "--bg", "focus ring"],
    ["--accent", "--bg-alt", "focus ring on panels"],
  ];

  for (const [name, selector] of Object.entries(themes)) {
    it(`${name}: text pairs are at least 4.5:1`, () => {
      const p = palette(selector);
      for (const [fg, bg, what] of textPairs) {
        const ratio = contrast(p[fg]!, p[bg]!);
        expect(ratio, `${what} ${p[fg]} on ${p[bg]} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`${name}: borders and the focus ring are at least 3:1`, () => {
      const p = palette(selector);
      for (const [a, b, what] of uiPairs) {
        const ratio = contrast(p[a]!, p[b]!);
        expect(ratio, `${what} ${p[a]} on ${p[b]} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(3);
      }
    });
  }

  it("both themes define every colour the test pairs use", () => {
    const names = [...textPairs.flat(), ...uiPairs.flat()].filter((n) => n.startsWith("--"));
    for (const selector of Object.values(themes)) {
      const p = palette(selector);
      for (const name of new Set(names)) if (!p[name]) throw new Error(`${selector} lacks ${name}`);
    }
  });
});
