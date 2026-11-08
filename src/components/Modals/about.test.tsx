import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AboutDialog } from "./AboutDialog";
import { useAppStore } from "../../store/useAppStore";
import { strings } from "../../lib/strings";
import { installIpcMock } from "../../test/ipcMock";

beforeEach(() => {
  installIpcMock();
  useAppStore.setState({ aboutOpen: true, modals: [], dialogs: [] });
});

describe("About dialog (task 8.6)", () => {
  it("shows the version, the project line, the license and the runtime info", () => {
    render(
      <AboutDialog
        info={{ version: "0.1.0", desktop: "GNOME", session: "wayland", appimage: false, dmabufDisabled: true }}
      />,
    );
    expect(screen.getByTestId("about-version").textContent).toBe("v0.1.0");
    expect(screen.getByText(strings.aboutProject)).toBeTruthy();
    expect(screen.getByText(strings.aboutLicense)).toBeTruthy();
    expect(screen.getByTestId("about-runtime").textContent ?? "").toContain("GNOME/wayland");
  });

  it("Close closes it", () => {
    render(<AboutDialog info={null} />);
    expect(screen.getByTestId("about-version").textContent).toBe(strings.loading);
    fireEvent.click(screen.getByTestId("about-close"));
    expect(useAppStore.getState().aboutOpen).toBe(false);
  });
});
