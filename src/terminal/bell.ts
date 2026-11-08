/**
 * Audible bell (task 6.8, R12): a short WebAudio beep, no audio file,
 * throttled to one per 200 ms so `cat` of a file full of BEL does not
 * machine-gun the user. Loudness/feel is a [human] check.
 */

const FREQUENCY_HZ = 880;
const DURATION_S = 0.08;
export const THROTTLE_MS = 200;

let lastRingAt = Number.NEGATIVE_INFINITY;
let ctx: AudioContext | null = null;

/** Pure rule so the throttle is unit-testable without audio. */
export function shouldRing(now: number, last: number): boolean {
  return now - last >= THROTTLE_MS;
}

function audioContext(): AudioContext | null {
  if (ctx) return ctx;
  const w = window as unknown as { AudioContext?: new () => AudioContext; webkitAudioContext?: new () => AudioContext };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

/** `enabled` reads settings.audibleBell at ring time, so no listener churn. */
export function ringBell(enabled: () => boolean): void {
  const now = performance.now();
  if (!enabled() || !shouldRing(now, lastRingAt)) return;
  lastRingAt = now;
  const ac = audioContext();
  if (!ac) return;
  try {
    void ac.resume?.().catch(() => {});
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = FREQUENCY_HZ;
    gain.gain.value = 0.06;
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + DURATION_S);
  } catch {
    // No audio device in this session: the bell stays silent.
  }
}

/** Only for tests: forget the throttle window and the AudioContext. */
export function resetBell(): void {
  lastRingAt = Number.NEGATIVE_INFINITY;
  ctx = null;
}

/** Only for tests: when the last beep started, so the throttle is assertable. */
export const lastRingAtOf = (): number => lastRingAt;
