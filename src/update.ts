/**
 * Daily update: for each target in targets.json, fetch today's star count,
 * advance the state file (lock prefix + recompute 5-day window), write
 * JSON+CSV and stable chart SVGs under charts/<owner>/<repo>.svg.
 *
 * Usage:
 *   npx tsx src/update.ts
 *   npx tsx src/update.ts --repo agentrhq/webcmd
 *
 * If a target has no state file yet, bootstraps it (full stargazer history).
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchAllStarredAt, fetchStarCount, cumulativeByDay } from "./github";
import {
  advanceState,
  bootstrapState,
  loadState,
  saveState,
  statePath,
  csvPath,
  toCsv,
} from "./state";
import { writeCharts } from "./chart";
import { parseRepo, todayUTC } from "./dates";

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
  if (!existsSync(TARGETS)) throw new Error(`missing ${TARGETS}`);
  const j = JSON.parse(readFileSync(TARGETS, "utf-8")) as {
    targets: TargetCfg[];
  };
  return j.targets || [];
}

async function ensureBootstrapped(t: TargetCfg) {
  const { slug, url } = parseRepo(t.repo || t.url);
  const path = statePath(DATA_DIR, slug);
  if (loadState(path)) return path;

  process.stderr.write(`  no state yet — bootstrapping ${slug}\n`);
  const endDate = todayUTC();
  const events = await fetchAllStarredAt(slug);
  const byDay = cumulativeByDay(events);
  const live = await fetchStarCount(slug);
  byDay.set(endDate, live);
  if (!byDay.has(t.startDate)) byDay.set(t.startDate, 0);

  const state = bootstrapState({
    repo: slug,
    url,
    startDate: t.startDate,
    endDate,
    rawByDate: byDay,
  });
  saveState(path, state);
  const cpath = csvPath(DATA_DIR, slug);
  mkdirSync(dirname(cpath), { recursive: true });
  writeFileSync(cpath, toCsv(state), "utf-8");
  const charts = await writeCharts(CHARTS_DIR, state);
  process.stderr.write(`  wrote ${charts.light}\n`);
  return path;
}

async function updateOne(t: TargetCfg) {
  const { slug } = parseRepo(t.repo || t.url);
  process.stderr.write(`Update ${slug}\n`);

  const path = await ensureBootstrapped(t);
  let state = loadState(path);
  if (!state) throw new Error(`state missing after bootstrap: ${path}`);

  const today = todayUTC();
  const count = await fetchStarCount(slug);
  process.stderr.write(`  ${today} raw stars = ${count}\n`);

  state = advanceState(state, today, count);
  saveState(path, state);
  const cpath = csvPath(DATA_DIR, slug);
  mkdirSync(dirname(cpath), { recursive: true });
  writeFileSync(cpath, toCsv(state), "utf-8");
  const charts = await writeCharts(CHARTS_DIR, state);

  const last = state.days[state.days.length - 1];
  const lockIdx = state.days.length - 1 - (state.lockupDays + 1);
  process.stderr.write(
    `  days=${state.days.length} last shown=${last.shown} ` +
      `locked through ${lockIdx >= 0 ? state.days[lockIdx].date : "(none yet)"}\n`,
  );
  process.stderr.write(`  wrote ${path}\n`);
  process.stderr.write(`  wrote ${charts.light}\n`);
  process.stderr.write(`  wrote ${charts.dark}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let targets = loadTargets();

  if (args.repo || args.url) {
    const want = parseRepo(String(args.repo || args.url)).slug;
    targets = targets.filter((t) => parseRepo(t.repo || t.url).slug === want);
    if (targets.length === 0) {
      // ad-hoc: allow updating a repo not yet in targets.json
      targets = [
        {
          repo: want,
          url: `https://github.com/${want}`,
          startDate: String(args.start || "2026-07-01"),
        },
      ];
    }
  }

  if (targets.length === 0) throw new Error("no targets to update");

  for (const t of targets) {
    await updateOne(t);
  }
}

main().catch((err) => {
  process.stderr.write(`update failed: ${err?.message || err}\n`);
  process.exit(1);
});
