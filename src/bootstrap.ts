/**
 * Bootstrap (or rebuild) a target's state file from real stargazer timestamps.
 *
 * Usage:
 *   npx tsx src/bootstrap.ts --repo agentrhq/webcmd --start 2026-07-01
 *   npx tsx src/bootstrap.ts --all
 *
 * Reads targets.json when --all. Writes data/<owner>/<repo>.json and .csv.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cumulativeByDay, fetchAllStarredAt, fetchStarCount } from "./github";
import {
  bootstrapState,
  saveState,
  statePath,
  csvPath,
  toCsv,
} from "./state";
import { writeCharts } from "./chart";
import { parseRepo, todayUTC } from "./dates";
import { writeFileSync, mkdirSync } from "node:fs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "data");
const CHARTS_DIR = join(ROOT, "charts");
const TARGETS = join(ROOT, "targets.json");

function parseArgs(argv: string[]) {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

interface TargetCfg {
  url: string;
  repo: string;
  startDate: string;
}

function loadTargets(): TargetCfg[] {
  if (!existsSync(TARGETS)) return [];
  const j = JSON.parse(readFileSync(TARGETS, "utf-8")) as {
    targets: TargetCfg[];
  };
  return j.targets || [];
}

async function bootstrapOne(repoInput: string, startDate: string) {
  const { slug, url } = parseRepo(repoInput);
  const endDate = todayUTC();

  process.stderr.write(`Bootstrap ${slug}  ${startDate} → ${endDate}\n`);
  process.stderr.write(`  fetching stargazer timestamps…\n`);

  const events = await fetchAllStarredAt(slug);
  process.stderr.write(`  ${events.length} star events\n`);

  const byDay = cumulativeByDay(events);
  // Pin today's total to the live counter (handles unstars / race with paginate).
  const live = await fetchStarCount(slug);
  byDay.set(endDate, live);
  process.stderr.write(`  live stargazers_count = ${live}\n`);

  // Ensure startDate is present (0 if nothing starred yet that day).
  if (!byDay.has(startDate) && startDate < (events[0]?.day ?? endDate)) {
    byDay.set(startDate, 0);
  }

  const state = bootstrapState({
    repo: slug,
    url,
    startDate,
    endDate,
    rawByDate: byDay,
  });

  const path = statePath(DATA_DIR, slug);
  saveState(path, state);
  const cpath = csvPath(DATA_DIR, slug);
  mkdirSync(dirname(cpath), { recursive: true });
  writeFileSync(cpath, toCsv(state), "utf-8");
  const charts = await writeCharts(CHARTS_DIR, state);

  const last = state.days[state.days.length - 1];
  process.stderr.write(
    `  wrote ${path} (${state.days.length} days, last raw=${last.raw} shown=${last.shown})\n`,
  );
  process.stderr.write(`  wrote ${cpath}\n`);
  process.stderr.write(`  wrote ${charts.light}\n`);
  process.stderr.write(`  wrote ${charts.dark}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.all) {
    const targets = loadTargets();
    if (targets.length === 0) throw new Error("targets.json has no targets");
    for (const t of targets) {
      await bootstrapOne(t.repo || t.url, t.startDate);
    }
    return;
  }

  const repo = String(args.repo || args.url || "");
  if (!repo) {
    throw new Error(
      "usage: bootstrap --repo owner/repo --start YYYY-MM-DD  |  bootstrap --all",
    );
  }
  const start = String(args.start || "2026-07-01");
  await bootstrapOne(repo, start);
}

main().catch((err) => {
  process.stderr.write(`bootstrap failed: ${err?.message || err}\n`);
  process.exit(1);
});
