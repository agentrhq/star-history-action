/**
 * Unit tests for the exponential lockup smoother.
 * Run: npx tsx src/smooth.test.ts
 */
import {
  CURVE_ALPHA,
  CURVE_WEIGHT,
  LOCKUP_DAYS,
  RAW_WEIGHT,
  publishNextDay,
  smoothDailyCounts,
} from "./smooth";

let failures = 0;
function check(name: string, cond: boolean) {
  if (cond) process.stdout.write(`ok   ${name}\n`);
  else {
    failures++;
    process.stdout.write(`FAIL ${name}\n`);
  }
}

check("lockup 5", LOCKUP_DAYS === 5);
check("alpha 2", CURVE_ALPHA === 2);
check("75/25 mix", CURVE_WEIGHT === 0.75 && RAW_WEIGHT === 0.25);

check("empty → empty", smoothDailyCounts([]).length === 0);
check("1 day raw", smoothDailyCounts([5])[0] === 5);
check(
  "2 days raw",
  JSON.stringify(smoothDailyCounts([5, 10])) === JSON.stringify([5, 10]),
);

{
  const raw = [100, 100, 100, 100, 1000];
  const shown = smoothDailyCounts(raw);
  check("today pins to raw", shown[shown.length - 1] === 1000);
}

// Build 30 days with jumps at day 5 (+900), 15 (+5000), 24 (+10000) — 1-based.
{
  const raw: number[] = [];
  let c = 100;
  for (let d = 0; d < 30; d++) {
    if (d === 4) c = 1000;
    else if (d === 14) c = 6680;
    else if (d === 23) c = 17280;
    else if (d > 0 && d < 4) c = 100;
    else if (d > 4 && d < 14) c = 1000 + (d - 4) * 56;
    else if (d > 14 && d < 23) c = 6680 + (d - 14) * 66;
    else if (d > 23) c = 17280;
    raw.push(c);
  }

  const shown = smoothDailyCounts(raw);
  check("same length", shown.length === raw.length);
  check("today pinned", shown[29] === raw[29]);
  check("first day raw", shown[0] === raw[0]);
  check(
    "monotone",
    shown.every((v, i) => i === 0 || v >= shown[i - 1]),
  );

  // Locked prefix must not move when a huge jump is appended.
  const raw2 = raw.concat([raw[raw.length - 1] + 50_000]);
  const shown2 = smoothDailyCounts(raw2);
  const lockIdx = raw2.length - 1 - (LOCKUP_DAYS + 1);
  let lockedSame = true;
  for (let i = 0; i <= lockIdx && i < shown.length; i++) {
    if (shown2[i] !== shown[i]) lockedSame = false;
  }
  check(`locked prefix stable (0..${lockIdx})`, lockedSame && lockIdx >= 0);

  // publishNextDay matches iterative smooth for one step.
  const prev = smoothDailyCounts(raw.slice(0, -1));
  const step = publishNextDay(prev, raw);
  check(
    "publishNextDay == full smooth last step",
    JSON.stringify(step) === JSON.stringify(shown),
  );
}

if (failures > 0) {
  process.stderr.write(`${failures} failure(s)\n`);
  process.exit(1);
}
process.stdout.write("all passed\n");
