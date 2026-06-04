// Potentiometer → reading speed mapping.
//
// The firmware streams the raw 12-bit ADC value (0..4095) as  POT <value>  at ~10 Hz.
// We map that linearly to a reading speed in characters/second, then to a per-character
// delay in milliseconds. The potentiometer is the learner's "speed knob".

export const MIN_CPS = 3; // slowest: 3 characters / second
export const MAX_CPS = 10; // fastest: 10 characters / second
export const POT_MAX = 4095; // 12-bit ADC

/** Clamp a raw pot value to a reading speed in characters/second. */
export function potToCps(pot: number): number {
  const t = Math.min(1, Math.max(0, pot / POT_MAX));
  return MIN_CPS + t * (MAX_CPS - MIN_CPS);
}

/** Convert a characters/second speed to the delay between characters, in ms. */
export function cpsToDelayMs(cps: number): number {
  return 1000 / cps;
}

/** Convenience: raw pot value → per-character delay in ms (≈100–333 ms). */
export function potToDelayMs(pot: number): number {
  return cpsToDelayMs(potToCps(pot));
}
