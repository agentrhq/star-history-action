/**
 * Re-render chart SVGs from existing state files (no GitHub API calls for stars).
 *   npx tsx src/render-charts.ts
 *   npx tsx src/render-charts.ts --repo agentrhq/webcmd
 */

import { existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadState } from "./state";
import { writeCharts } from "./chart";
import { parseRepo } from "./dates";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "data");
const CHARTS_DIR = join(ROOT, "charts");

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

function listStateFiles(): string[] {
  if (!existsSync(DATA_DIR)) return [];
  const out: string[] = [];
  for (const owner of readdirSync(DATA_DIR, { withFileTypes: true })) {
    if (!owner.isDirectory()) continue;
    const dir = join(DATA_DIR, owner.name);
    for (const f of readdirSync(dir)) {
      if (f.endsWith(".json")) out.push(join(dir, f));
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let files = listStateFiles();

  if (args.repo || args.url) {
    const want = parseRepo(String(args.repo || args.url)).slug;
    files = files.filter((p) => {
      const s = loadState(p);
      return s?.repo === want;
    });
  }

  if (files.length === 0) throw new Error("no state files to render");

  for (const path of files) {
    const state = loadState(path);
    if (!state) continue;
    const charts = await writeCharts(CHARTS_DIR, state);
    process.stderr.write(`wrote ${charts.light}\n`);
    process.stderr.write(`wrote ${charts.dark}\n`);
  }
}

main().catch((err) => {
  process.stderr.write(`render-charts failed: ${err?.message || err}\n`);
  process.exit(1);
});
