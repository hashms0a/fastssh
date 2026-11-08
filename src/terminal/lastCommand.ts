/**
 * Markers for Alt+C / Alt+Up (task 6.6, R15). One marker per Enter press,
 * replaced by the next one, so keystrokes cost O(1) and no per-keystroke store
 * write happens. The shape below is the subset of a Terminal the module needs,
 * so the logic is unit-testable with a fake buffer.
 */

export interface MarkerLike {
  readonly line: number;
  dispose(): void;
}

export interface LineLike {
  translateToString(trimRight?: boolean): string;
}

export interface BufferLike {
  readonly baseY: number;
  readonly cursorY: number;
  getLine(line: number): LineLike | undefined;
}

export interface MarkerTerm {
  onData(cb: (data: string) => void): { dispose(): void };
  registerMarker(cursorYOffset?: number): MarkerLike;
  readonly buffer: { active: BufferLike };
  scrollToLine(line: number): void;
}

export class LastCommandTracker {
  private marker: MarkerLike | null = null;
  private readonly input: { dispose(): void };

  constructor(private readonly term: MarkerTerm) {
    // Many terminals fire onData per key; only Enter moves the marker.
    this.input = term.onData((data) => {
      if (data.includes("\r")) this.mark();
    });
  }

  /** The line the command was typed on. Called on Enter, so the cursor is there. */
  mark(): void {
    this.marker?.dispose();
    this.marker = this.term.registerMarker(0);
  }

  /** null when there is no marker yet or it was trimmed out of the scrollback. */
  get line(): number | null {
    const m = this.marker;
    return m && m.line >= 0 ? m.line : null;
  }

  /** Alt+Up: scroll to the start of the last command. False = "No command yet". */
  scrollToStart(): boolean {
    const line = this.line;
    if (line === null) return false;
    this.term.scrollToLine(line);
    return true;
  }

  /**
   * Alt+C: the lines between the command and the prompt
   * (marker.line+1 .. baseY+cursorY-1), trailing blanks removed.
   * null = "Nothing to copy".
   */
  copyOutput(): string | null {
    const start = this.line;
    if (start === null) return null;
    const buffer = this.term.buffer.active;
    const end = buffer.baseY + buffer.cursorY - 1;
    const lines: string[] = [];
    for (let i = start + 1; i <= end; i++) lines.push(buffer.getLine(i)?.translateToString(true) ?? "");
    while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    return lines.length > 0 ? lines.join("\n") : null;
  }

  dispose(): void {
    this.marker?.dispose();
    this.input.dispose();
    this.marker = null;
  }
}
