/** UTC calendar-day helpers. All tracker dates are YYYY-MM-DD in UTC. */

export function todayUTC(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function parseDayUTC(key: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) throw new Error(`expected YYYY-MM-DD, got ${key}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export function addDaysUTC(key: string, days: number): string {
  const dt = parseDayUTC(key);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function dayKeysInclusive(start: string, end: string): string[] {
  if (start > end) return [];
  const out: string[] = [];
  for (let k = start; ; k = addDaysUTC(k, 1)) {
    out.push(k);
    if (k === end) break;
  }
  return out;
}

/** Parse owner/repo from a GitHub URL or bare owner/repo. */
export function parseRepo(input: string): { owner: string; repo: string; slug: string; url: string } {
  const trimmed = input.trim().replace(/\/+$/, "");
  let slug = trimmed;
  const urlMatch = trimmed.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/#?]+)/i,
  );
  if (urlMatch) {
    slug = `${urlMatch[1]}/${urlMatch[2]}`;
  }
  const parts = slug.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`invalid repo (want owner/repo or GitHub URL): ${input}`);
  }
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/, "");
  return {
    owner,
    repo,
    slug: `${owner}/${repo}`,
    url: `https://github.com/${owner}/${repo}`,
  };
}
