import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { ContextMenu } from "./ContextMenu";

/**
 * Regression guard for the sidebar menus: a menu is mounted inside the row
 * that opened it, and a selected row sets `text-[var(--on-accent)]` — the
 * near-black label colour for the light-blue accent fill. Inheriting that
 * painted dark labels on the dark `--bg-alt` panel, so each item must name its
 * own colour.
 */
describe("ContextMenu contrast", () => {
  const items = [
    { label: "Connect", run: vi.fn() },
    { label: "Edit", run: vi.fn() },
    { label: "Remove", run: vi.fn(), disabled: true },
  ];

  const renderInSelectedRow = () =>
    render(
      <div className="bg-[var(--accent)] text-[var(--on-accent)]">
        <ContextMenu x={0} y={0} items={items} onClose={() => {}} />
      </div>,
    );

  it("names its own text colour instead of inheriting the row's", () => {
    const { container } = renderInSelectedRow();
    expect(container.querySelector('[role="menu"]')!.className).toContain("text-[var(--fg)]");
    for (const item of container.querySelectorAll('[role="menuitem"]')) {
      expect(item.className).toContain("text-[var(--fg)]");
      // The highlight fill and its label swap together, so hover/keyboard focus
      // keeps --on-accent on --accent (the pair themeContrast.test.ts asserts).
      expect(item.className).toContain("enabled:hover:bg-[var(--accent)]");
      expect(item.className).toContain("enabled:hover:text-[var(--on-accent)]");
      expect(item.className).toContain("enabled:focus:bg-[var(--accent)]");
    }
  });

  it("reads disabled items as muted rather than as faded dark text", () => {
    const { container } = renderInSelectedRow();
    const disabled = [...container.querySelectorAll('[role="menuitem"]')].find((b) => b.hasAttribute("disabled"));
    expect(disabled?.className).toContain("disabled:text-[var(--muted)]");
    expect(disabled?.className).not.toContain("disabled:opacity-");
  });
});
