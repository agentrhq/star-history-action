/**
 * Per-target state file: locked history + open window of raw/shown series.
 *
 * Path: data/<owner>/<repo>.json
 *
 * On each daily run:
 *   1. Append today's raw star count (from GitHub API).
 *   2. Copy shown[0..lockIdx] from yesterday (frozen).
 *   3. Recompute the last LOCKUP_DAYS with 75% exponential curve + 25% raw.
 *   4. Write state back.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { LOCKUP_DAYS, publishNextDay, smoothDailyCounts } from "./smooth";
import { addDaysUTC, dayKeysInclusive, parseRepo, todayUTC } from "./dates";

export const STATE_VERSION = 1;

export interface DayPoint {
  date: string; // YYYY-MM-DD UTC
  raw: number;
  shown: number;
}

export interface TargetState {
  version: number;
  repo: string; // owner/repo
  url: string;
  startDate: string;
  updatedAt: string; // ISO timestamp of last successful run
  lockupDays: number;
  /** Full daily series from startDate through last observed day. */
  days: DayPoint[];
}

export function statePath(dataDir: string, slug: string): string {
  const { owner, repo } = parseRepo(slug);
  return join(dataDir, owner, `${repo}.json`);
}

export function loadState(path: string): TargetState | null {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf-8");
  const s = JSON.parse(raw) as TargetState;
  if (s.version !== STATE_VERSION) {
    throw new Error(`unsupported state version ${s.version} in ${path}`);
  }
  return s;
}

export function saveState(path: string, state: TargetState): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2) + "\n", "utf-8");
}

/**
 * Build initial state from a dense daily raw series (one count per day from
 * startDate through endDate inclusive). Shown is the full iterative smooth.
 */
export function bootstrapState(opts: {
  repo: string;
  url: string;
  startDate: string;
  endDate: string;
  rawByDate: Map<string, number> | number[];
  now?: Date;
}): TargetState {
  const keys = dayKeysInclusive(opts.startDate, opts.endDate);
  if (keys.length === 0) {
    throw new Error(`empty range ${opts.startDate}..${opts.endDate}`);
  }

  const raw: number[] = [];
  if (Array.isArray(opts.rawByDate)) {
    if (opts.rawByDate.length !== keys.length) {
      throw new Error(
        `raw array length ${opts.rawByDate.length} != day count ${keys.length}`,
      );
    }
    raw.push(...opts.rawByDate.map(Number));
  } else {
    let last = 0;
    for (const k of keys) {
      if (opts.rawByDate.has(k)) last = Number(opts.rawByDate.get(k));
      raw.push(last);
    }
  }

  const shown = smoothDailyCounts(raw);
  const days: DayPoint[] = keys.map((date, i) => ({
    date,
    raw: raw[i],
    shown: shown[i],
  }));

  return {
    version: STATE_VERSION,
    repo: opts.repo,
    url: opts.url,
    startDate: opts.startDate,
    updatedAt: (opts.now ?? new Date()).toISOString(),
    lockupDays: LOCKUP_DAYS,
    days,
  };
}

/**
 * Advance state by one calendar day with a new raw measurement.
 * If `today` is already the last day, replaces that day's raw and recomputes
 * the open window (same-day re-run). If `today` is past the last day by more
 * than one, fills intermediate days with LOCF raw then applies today.
 */
export function advanceState(
  state: TargetState,
  today: string,
  todayRaw: number,
  now: Date = new Date(),
): TargetState {
  if (today < state.startDate) {
    throw new Error(`today ${today} is before startDate ${state.startDate}`);
  }

  const days = state.days.map((d) => ({ ...d }));
  if (days.length === 0) {
    const boot = bootstrapState({
      repo: state.repo,
      url: state.url,
      startDate: state.startDate,
      endDate: today,
      rawByDate: new Map([[today, todayRaw]]),
      now,
    });
    return boot;
  }

  let lastDate = days[days.length - 1].date;

  // Same-day refresh: rewrite last raw and rebuild shown from prior lock.
  if (today === lastDate) {
    days[days.length - 1] = {
      date: today,
      raw: todayRaw,
      shown: days[days.length - 1].shown, // placeholder; recomputed below
    };
    return recomputeTail({ ...state, days, updatedAt: now.toISOString() });
  }

  if (today < lastDate) {
    throw new Error(
      `today ${today} is before last state day ${lastDate}; refusing to rewrite history`,
    );
  }

  // Gap fill: LOCF raw for missing days, then append today.
  while (addDaysUTC(lastDate, 1) < today) {
    const nextDate = addDaysUTC(lastDate, 1);
    const locf = days[days.length - 1].raw;
    days.push({ date: nextDate, raw: locf, shown: locf });
    lastDate = nextDate;
  }

  days.push({ date: today, raw: todayRaw, shown: todayRaw });
  return recomputeTail({ ...state, days, updatedAt: now.toISOString() });
}

/**
 * Recompute shown for the open window using publishNextDay, keeping the locked
 * prefix from the previous shown values already stored on `days`.
 */
function recomputeTail(state: TargetState): TargetState {
  const days = state.days;
  const n = days.length;
  if (n === 0) return state;

  const raw = days.map((d) => d.raw);
  // Previous shown = everything except we need prev as of yesterday.
  // publishNextDay wants prevShown covering lockIdx; use current shown for
  // indices that already exist (locked ones are stable; window ones get replaced).
  const prevShown = days.slice(0, Math.max(0, n - 1)).map((d) => d.shown);
  const nextShown = publishNextDay(prevShown, raw);

  const out: DayPoint[] = days.map((d, i) => ({
    date: d.date,
    raw: d.raw,
    shown: nextShown[i],
  }));

  return { ...state, days: out, lockupDays: LOCKUP_DAYS };
}

/** CSV export: date,raw,shown */
export function toCsv(state: TargetState): string {
  const lines = ["date,raw,shown"];
  for (const d of state.days) {
    lines.push(`${d.date},${d.raw},${d.shown}`);
  }
  return lines.join("\n") + "\n";
}

export function csvPath(dataDir: string, slug: string): string {
  const { owner, repo } = parseRepo(slug);
  return join(dataDir, owner, `${repo}.csv`);
}

export { todayUTC, parseRepo };
