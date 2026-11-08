import { describe, expect, it } from "vitest";
import { LastCommandTracker, type BufferLike, type LineLike, type MarkerLike, type MarkerTerm } from "./lastCommand";

/** A terminal that only implements what the tracker touches (task 6.10). */
class FakeTerm implements MarkerTerm {
  private readonly listeners: Array<(data: string) => void> = [];
  readonly markers: Array<{ line: number; dispose(): void }> = [];
  readonly scrolled: number[] = [];
  lines: string[] = [];
  baseY = 0;
  cursorY = 0;

  onData(cb: (data: string) => void): { dispose(): void } {
    this.listeners.push(cb);
    return { dispose: () => {} };
  }

  registerMarker(cursorYOffset = 0): MarkerLike {
    const marker: { line: number; dispose(): void } = {
      line: this.baseY + this.cursorY + cursorYOffset,
      dispose() {
        this.line = -1; // xterm reports -1 once a marker is gone
      },
    };
    this.markers.push(marker);
    return marker;
  }

  get buffer(): { active: BufferLike } {
    const lines = this.lines;
    const line = (i: number): LineLike | undefined =>
      i < 0 || i >= lines.length ? undefined : { translateToString: () => lines[i] ?? "" };
    return { active: { baseY: this.baseY, cursorY: this.cursorY, getLine: line } };
  }

  scrollToLine(line: number): void {
    this.scrolled.push(line);
  }

  /** Simulate what xterm's onData receives for typed keys. */
  type(data: string): void {
    for (const cb of this.listeners) cb(data);
  }
}

const PROMPT = "tester@dev:~$";

/** `printf 'a\nb\nc\n'` followed by the next prompt line. */
function setup(): FakeTerm {
  const term = new FakeTerm();
  term.lines = [`${PROMPT} printf 'a\\nb\\nc\\n'`, "a", "b", "c", `${PROMPT} `];
  term.cursorY = 0;
  return term;
}

describe("LastCommandTracker (R15)", () => {
  it("marks only on Enter, not on every keystroke", () => {
    const term = setup();
    const tracker = new LastCommandTracker(term);
    term.type("p");
    term.type("r");
    term.type("i");
    term.type("nt");
    expect(term.markers).toHaveLength(0);
    term.type("\r");
    expect(term.markers).toHaveLength(1);
    expect(tracker.line).toBe(0);
    tracker.dispose();
  });

  it("Alt+C copies the lines between the command and the prompt", () => {
    const term = setup();
    const tracker = new LastCommandTracker(term);
    term.type("\r"); // marker on line 0
    term.cursorY = 4; // the prompt of the next command
    expect(tracker.copyOutput()).toBe("a\nb\nc");
    tracker.dispose();
  });

  it("drops trailing blank lines", () => {
    const term = setup();
    term.lines = ["cmd", "out", "", "", `${PROMPT} `];
    const tracker = new LastCommandTracker(term);
    term.type("\r");
    term.cursorY = 4;
    expect(tracker.copyOutput()).toBe("out");
    tracker.dispose();
  });

  it("a command with no output says nothing to copy", () => {
    const term = setup();
    term.lines = ["cd .", `${PROMPT} `];
    const tracker = new LastCommandTracker(term);
    term.type("\r");
    term.cursorY = 1;
    expect(tracker.copyOutput()).toBeNull();
    tracker.dispose();
  });

  it("Alt+Up scrolls to the marker, and the next Enter replaces it", () => {
    const term = setup();
    const tracker = new LastCommandTracker(term);
    term.type("\r");
    term.cursorY = 4;
    expect(tracker.scrollToStart()).toBe(true);
    expect(term.scrolled).toEqual([0]);

    // Second command: the old marker is disposed, so only one is live.
    term.lines.push("seq 1 3", "1", "2", "3", `${PROMPT} `);
    term.cursorY = 5;
    term.type("\r");
    term.cursorY = 9;
    expect(term.markers[0]!.line).toBe(-1);
    expect(tracker.line).toBe(5);
    expect(tracker.copyOutput()).toBe("1\n2\n3");
    tracker.dispose();
  });

  it("no marker yet: Alt+Up false, Alt+C null", () => {
    const term = setup();
    const tracker = new LastCommandTracker(term);
    expect(tracker.scrollToStart()).toBe(false);
    expect(tracker.copyOutput()).toBeNull();
    tracker.dispose();
  });

  it("a marker trimmed out of the scrollback is treated as gone", () => {
    const term = setup();
    const tracker = new LastCommandTracker(term);
    term.type("\r");
    term.markers[0]!.line = -1; // xterm sets -1 when the line scrolled away
    expect(tracker.line).toBeNull();
    expect(tracker.scrollToStart()).toBe(false);
    expect(tracker.copyOutput()).toBeNull();
    tracker.dispose();
  });

  it("marker and buffer indices are absolute, so trimmed scrollback still works", () => {
    const term = new FakeTerm();
    // Absolute buffer: 100 lines were trimmed, so baseY is 100 and the
    // command sits on absolute line 100 with its output above the prompt.
    term.lines = new Array(100).fill("").concat(["cmd", "a", "b", "c", `${PROMPT} `]);
    term.baseY = 100;
    term.cursorY = 4;
    const tracker = new LastCommandTracker(term);
    term.cursorY = 0;
    term.type("\r"); // marker on absolute line 100
    expect(tracker.line).toBe(100);
    term.cursorY = 4;
    expect(tracker.copyOutput()).toBe("a\nb\nc");
    expect(tracker.scrollToStart()).toBe(true);
    expect(term.scrolled).toEqual([100]);
    tracker.dispose();
  });
});
