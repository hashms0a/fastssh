export interface Debounced {
  /** (Re)start the timer; coalesces rapid calls. */
  call: () => void;
  /** Run a pending call right now; no-op when nothing is pending. */
  flush: () => void;
  /** Drop a pending call. */
  cancel: () => void;
}

export function debounce(fn: () => void, ms: number): Debounced {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clear = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return {
    call: () => {
      clear();
      timer = setTimeout(() => {
        timer = null;
        fn();
      }, ms);
    },
    flush: () => {
      if (timer !== null) {
        clear();
        fn();
      }
    },
    cancel: clear,
  };
}
