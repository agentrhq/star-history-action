/**
 * Exponential lockup smoother for monotone cumulative metrics (e.g. stars).
 *
 * Preferred strategy:
 *   - Lockup = 5 days (history older than that never moves again)
 *   - Anchor exponential curve from last locked value → today's raw measurement
 *   - Inside the window: shown = 0.75 * curve + 0.25 * measured
 *   - Days 1–2 (too short for a curve) stay raw
 *   - Today always pins to the raw measurement
 */

export const LOCKUP_DAYS = 5;
/** Curvature α in (e^{α t} - 1) / (e^{α} - 1). Higher → more weight near today. */
export const CURVE_ALPHA = 2;
/** Weight on the exponential curve inside the uncertainty window. */
export const CURVE_WEIGHT = 0.75;
/** Weight on the raw measurement inside the uncertainty window. */
export const RAW_WEIGHT = 0.25;

export function expCurveY(
  t: number,
  yLock: number,
  yToday: number,
  alpha: number = CURVE_ALPHA,
): number {
  // t in [0, 1]; α=0 degenerates to linear.
  if (alpha === 0) return yLock + (yToday - yLock) * t;
  const denom = Math.exp(alpha) - 1;
  const y = yLock + (yToday - yLock) * ((Math.exp(alpha * t) - 1) / denom);
  return Math.round(y);
}

/**
 * Publish one new day given the previous shown series and the full raw series
 * through today (raw.length === prevShown.length + 1, or equal on first fill).
 *
 * Used by the daily updater so locked history is copied from yesterday's
 * published numbers, not recomputed from raw.
 */
export function publishNextDay(
  prevShown: number[],
  rawThroughToday: number[],
  opts?: {
    lockupDays?: number;
    alpha?: number;
    curveWeight?: number;
    rawWeight?: number;
  },
): number[] {
  const lockup = opts?.lockupDays ?? LOCKUP_DAYS;
  const alpha = opts?.alpha ?? CURVE_ALPHA;
  const wCurve = opts?.curveWeight ?? CURVE_WEIGHT;
  const wRaw = opts?.rawWeight ?? RAW_WEIGHT;

  const d = rawThroughToday.length - 1; // index of today
  if (d < 0) return [];
  if (d < 2) return rawThroughToday.map((v) => Number(v));

  const lockIdx = d - (lockup + 1);
  const next = new Array<number>(d + 1);

  if (lockIdx >= 0) {
    if (prevShown.length <= lockIdx) {
      throw new Error(
        `prevShown length ${prevShown.length} cannot cover lockIdx ${lockIdx}`,
      );
    }
    for (let i = 0; i <= lockIdx; i++) next[i] = prevShown[i];
  }

  const startIdx = lockIdx >= 0 ? lockIdx : 0;
  const yLock =
    lockIdx >= 0 ? Math.round(prevShown[lockIdx]) : Number(rawThroughToday[0]);
  const yToday = Number(rawThroughToday[d]);
  const span = d - startIdx;

  const from = lockIdx >= 0 ? lockIdx + 1 : 0;
  for (let i = from; i <= d; i++) {
    const t = span === 0 ? 1 : (i - startIdx) / span;
    const curve = expCurveY(t, yLock, yToday, alpha);
    if (i === d) {
      next[i] = yToday;
    } else {
      next[i] = wCurve * curve + wRaw * Number(rawThroughToday[i]);
    }
  }

  // Integer counts; enforce non-decreasing (stars are monotone up).
  let prev = Number.NEGATIVE_INFINITY;
  return next.map((v) => {
    let x = Math.round(v);
    if (x < prev) x = prev;
    prev = x;
    return x;
  });
}

/**
 * Iterative lockup smooth over a full dense daily raw series.
 * Simulates publishing one new day at a time (bootstrap / backfill).
 */
export function smoothDailyCounts(
  raw: number[],
  opts?: {
    lockupDays?: number;
    alpha?: number;
    curveWeight?: number;
    rawWeight?: number;
  },
): number[] {
  const n = raw.length;
  if (n === 0) return [];
  if (n <= 2) return raw.map((v) => Number(v));

  let shown: number[] = [];
  for (let d = 0; d < n; d++) {
    shown = publishNextDay(shown, raw.slice(0, d + 1), opts);
  }
  return shown;
}
