/**
 * GitHub star-count helpers. Uses `gh api` when available (inherits user auth),
 * otherwise the REST API with GITHUB_TOKEN / GH_TOKEN.
 */

import { execFileSync } from "node:child_process";

export interface StarEvent {
  starredAt: string; // ISO
  day: string; // YYYY-MM-DD UTC
}

function authHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
  const h: Record<string, string> = {
    Accept: "application/vnd.github.star+json",
    "User-Agent": "star-smooth-tracker",
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

/** Current stargazers_count for owner/repo. */
export async function fetchStarCount(slug: string): Promise<number> {
  // Prefer gh (uses your logged-in credentials).
  try {
    const out = execFileSync(
      "gh",
      ["api", `repos/${slug}`, "--jq", ".stargazers_count"],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
    const n = Number(out);
    if (Number.isFinite(n)) return n;
  } catch {
    // fall through to fetch
  }

  const res = await fetch(`https://api.github.com/repos/${slug}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(`GET repos/${slug} → HTTP ${res.status}`);
  }
  const body = (await res.json()) as { stargazers_count: number };
  return body.stargazers_count;
}

/**
 * Full stargazer event list (starred_at), oldest first.
 * Requires a token that can read stargazers (repo owner/collaborator after
 * GitHub's 2026 restriction, or public if still open).
 */
export async function fetchAllStarredAt(slug: string): Promise<StarEvent[]> {
  // gh --paginate is the reliable path for 100+ pages of auth'd data.
  try {
    const out = execFileSync(
      "gh",
      [
        "api",
        `repos/${slug}/stargazers?per_page=100`,
        "-H",
        "Accept: application/vnd.github.star+json",
        "--paginate",
        "--jq",
        ".[].starred_at",
      ],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 },
    );
    return out
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((starredAt) => ({
        starredAt,
        day: starredAt.slice(0, 10),
      }))
      .sort((a, b) => a.starredAt.localeCompare(b.starredAt));
  } catch (e) {
    process.stderr.write(`gh stargazers failed (${e}); trying fetch paginate\n`);
  }

  const events: StarEvent[] = [];
  let page = 1;
  for (;;) {
    const url = `https://api.github.com/repos/${slug}/stargazers?per_page=100&page=${page}`;
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) {
      throw new Error(`GET stargazers page ${page} → HTTP ${res.status}`);
    }
    const batch = (await res.json()) as Array<{ starred_at: string }>;
    if (batch.length === 0) break;
    for (const row of batch) {
      if (!row.starred_at) continue;
      events.push({
        starredAt: row.starred_at,
        day: row.starred_at.slice(0, 10),
      });
    }
    if (batch.length < 100) break;
    page++;
  }
  events.sort((a, b) => a.starredAt.localeCompare(b.starredAt));
  return events;
}

/**
 * Build end-of-day cumulative star counts from individual star events.
 * Days with no stars keep the previous total (LOCF when the caller densifies).
 * Returns a map day → cumulative count at end of that day.
 */
export function cumulativeByDay(events: StarEvent[]): Map<string, number> {
  const byDay = new Map<string, number>();
  let total = 0;
  // events must be sorted oldest-first
  let i = 0;
  const sorted = [...events].sort((a, b) => a.starredAt.localeCompare(b.starredAt));
  while (i < sorted.length) {
    const day = sorted[i].day;
    while (i < sorted.length && sorted[i].day === day) {
      total++;
      i++;
    }
    byDay.set(day, total);
  }
  return byDay;
}
