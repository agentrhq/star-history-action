/**
 * State machine tests (bootstrap + daily advance + lock freeze).
 * Run: npx tsx src/state.test.ts
 */
import { advanceState, bootstrapState } from "./state";
import { LOCKUP_DAYS } from "./smooth";
import { addDaysUTC, dayKeysInclusive } from "./dates";

let failures = 0;
function check(name: string, cond: boolean) {
  if (cond) process.stdout.write(`ok   ${name}\n`);
  else {
    failures++;
    process.stdout.write(`FAIL ${name}\n`);
  }
}

{
  // 20-day synthetic raw with a late jump.
  const start = "2026-07-01";
  const keys = dayKeysInclusive(start, addDaysUTC(start, 19));
  const raw = keys.map((_, i) => (i < 15 ? 10 + i : 10 + i + 500));

  const state = bootstrapState({
    repo: "acme/demo",
    url: "https://github.com/acme/demo",
    startDate: start,
    endDate: keys[keys.length - 1],
    rawByDate: raw,
  });

  check("bootstrap day count", state.days.length === 20);
  check("today pin", state.days[19].shown === raw[19]);
  check("startDate set", state.startDate === start);

  // Advance one more day with another jump.
  const nextDate = addDaysUTC(keys[keys.length - 1], 1);
  const nextRaw = raw[raw.length - 1] + 1000;
  const advanced = advanceState(state, nextDate, nextRaw);

  check("advanced length", advanced.days.length === 21);
  check("new today pin", advanced.days[20].shown === nextRaw);

  // Locked prefix (relative to new today) must match previous shown.
  const lockIdx = 20 - (LOCKUP_DAYS + 1);
  let ok = lockIdx >= 0;
  for (let i = 0; i <= lockIdx; i++) {
    if (advanced.days[i].shown !== state.days[i].shown) ok = false;
  }
  check(`advance freezes lock 0..${lockIdx}`, ok);

  // Same-day re-run with higher count only moves the open window.
  const again = advanceState(advanced, nextDate, nextRaw + 50);
  check("same-day length stable", again.days.length === 21);
  check("same-day pin", again.days[20].shown === nextRaw + 50);
  let lockOk = true;
  for (let i = 0; i <= lockIdx; i++) {
    if (again.days[i].shown !== advanced.days[i].shown) lockOk = false;
  }
  check("same-day keeps lock", lockOk);
}

{
  // Gap fill LOCF
  const start = "2026-07-01";
  const state = bootstrapState({
    repo: "acme/gap",
    url: "https://github.com/acme/gap",
    startDate: start,
    endDate: start,
    rawByDate: [5],
  });
  const jumped = advanceState(state, "2026-07-05", 40);
  check("gap filled to 5 days", jumped.days.length === 5);
  check("gap LOCF raw mid", jumped.days[2].raw === 5);
  check("gap last raw", jumped.days[4].raw === 40);
}

if (failures > 0) {
  process.stderr.write(`${failures} failure(s)\n`);
  process.exit(1);
}
process.stdout.write("all passed\n");
