/**
 * Render a star-history SVG from a target's shown series.
 *
 * Visual language matches classic star-history.com charts:
 *   - white (or dark) canvas, black axes, no grid
 *   - coral-red line #dd4528
 *   - handwriting font stack (xkcd / Comic Neue / Comic Sans)
 *   - centered "Star History" title + optional owner avatar
 *   - top-left legend pill with repo name
 *   - axis labels "GitHub Stars" / "Date"
 *
 * Stable path: charts/<owner>/<repo>.svg  (overwrite in place → constant URL)
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TargetState } from "./state";
import { parseRepo } from "./dates";

/** Handwriting stack used by star-history (xkcd face name + real fallbacks). */
const FONT =
  'xkcd, "Comic Neue", "Comic Sans MS", "Segoe Print", "Bradley Hand", cursive';

/** Classic star-history series color (first dataset). */
const LINE_RED = "#dd4528";

function isWebcmd(slug: string): boolean {
  return slug.toLowerCase() === "agentrhq/webcmd";
}

/** Canonical Webcmd terminal mark (dark background, light foreground). */
const WEBCMD_LOGO_DATA_URL =
  "data:image/png;base64,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";

export interface ChartTheme {
  name: "light" | "dark";
  background: string;
  axis: string;
  label: string;
  title: string;
  line: string;
  legendBg: string;
  legendBorder: string;
  /** Subtle sketch filter strength; 0 disables. */
  wobble: number;
}

export const LIGHT: ChartTheme = {
  name: "light",
  background: "#ffffff",
  axis: "#000000",
  label: "#000000",
  title: "#000000",
  line: LINE_RED,
  legendBg: "#ffffff",
  legendBorder: "#000000",
  wobble: 5,
};

export const DARK: ChartTheme = {
  name: "dark",
  background: "#0d1117",
  axis: "#e6edf3",
  label: "#e6edf3",
  title: "#e6edf3",
  line: LINE_RED,
  legendBg: "#0d1117",
  legendBorder: "#e6edf3",
  wobble: 5,
};

function formatDay(iso: string): string {
  // star-history style: "Jul 12" (zero-padded day)
  const [, m, d] = iso.split("-").map(Number);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[m - 1]} ${String(d).padStart(2, "0")}`;
}

function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  let step: number;
  if (norm <= 1) step = 1 * mag;
  else if (norm <= 2) step = 2 * mag;
  else if (norm <= 5) step = 5 * mag;
  else step = 10 * mag;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) {
    ticks.push(Math.round(v * 1e6) / 1e6);
  }
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  // Drop a lone 0 label clutter if we only have 0 — keep 0 as blank like star-history sometimes does
  return ticks;
}

/** Catmull-Rom → cubic bezier path so the line looks smooth like star-history. */
function smoothPath(
  pts: Array<{ x: number; y: number }>,
): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
  if (pts.length === 2) {
    return `M${pts[0].x},${pts[0].y}L${pts[1].x},${pts[1].y}`;
  }

  const d: string[] = [`M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? 0 : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d.push(
      `C${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`,
    );
  }
  return d.join("");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const FONT_XML = escapeXml(FONT);

/** Optional embedded @font-face so PNG/offline viewers get Comic Neue. GitHub README <img> strips this. */
function fontFaceCss(): string {
  const fontsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "renderer", "fonts");
  const regular = join(fontsDir, "ComicNeue-Regular.ttf");
  const bold = join(fontsDir, "ComicNeue-Bold.ttf");
  const parts: string[] = [];
  if (existsSync(regular)) {
    const b64 = readFileSync(regular).toString("base64");
    parts.push(`@font-face{font-family:'Comic Neue';font-weight:400;src:url(data:font/ttf;base64,${b64}) format('truetype');}`);
  }
  if (existsSync(bold)) {
    const b64 = readFileSync(bold).toString("base64");
    parts.push(`@font-face{font-family:'Comic Neue';font-weight:700;src:url(data:font/ttf;base64,${b64}) format('truetype');}`);
  }
  // Alias xkcd → Comic Neue so the classic family name resolves when the face is present.
  if (parts.length) {
    parts.push(`@font-face{font-family:'xkcd';font-weight:400;src:local('Comic Neue'),local('Comic Sans MS');}`);
  }
  return parts.join("");
}

export function renderStarSvg(
  state: TargetState,
  opts?: {
    width?: number;
    height?: number;
    theme?: ChartTheme;
    series?: "shown" | "raw";
    /** data: URL or https avatar; empty skips the title badge */
    avatarDataUrl?: string;
    embedFont?: boolean;
  },
): string {
  const width = opts?.width ?? 800;
  const height = opts?.height ?? 533;
  const theme = opts?.theme ?? LIGHT;
  const seriesKey = opts?.series ?? "shown";
  const embedFont = opts?.embedFont !== false;

  const days = state.days;
  if (days.length === 0) {
    return emptySvg(width, height, theme, state.repo);
  }

  const values = days.map((d) => (seriesKey === "raw" ? d.raw : d.shown));
  const maxY = Math.max(...values, 1);
  const yTicks = niceTicks(maxY, 4);
  const yMax = Math.max(yTicks[yTicks.length - 1], maxY);

  // Layout mirrors star-history: generous margins for title / axis labels.
  const padL = 70;
  const padR = 30;
  const padT = 60;
  const padB = 70;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const n = days.length;
  const xAt = (i: number) =>
    padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yAt = (v: number) => padT + plotH - (v / yMax) * plotH;

  const pts = values.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
  const lineD = smoothPath(pts);

  // X labels: ~5 ticks, star-history style "Jul 12"
  const xLabelIdx: number[] = [];
  const labelCount = Math.min(5, n);
  if (n === 1) xLabelIdx.push(0);
  else {
    // Skip the very first point a bit (like the reference starts mid-range)
    const start = n > 8 ? Math.floor(n * 0.12) : 0;
    const end = n - 1;
    for (let k = 0; k < labelCount; k++) {
      const t = labelCount === 1 ? 0 : k / (labelCount - 1);
      xLabelIdx.push(Math.round(start + t * (end - start)));
    }
  }

  const filterId = `wobble-${theme.name}`;
  const filterAttr = theme.wobble > 0 ? ` filter="url(#${filterId})"` : "";

  const yLabels = yTicks
    .filter((t) => t > 0) // star-history often leaves 0 blank
    .map((t) => {
      const y = yAt(t);
      return `<text x="${padL - 12}" y="${(y + 5).toFixed(2)}" text-anchor="end" fill="${theme.label}" font-size="16" font-family="${FONT_XML}">${t}</text>`;
    })
    .join("\n    ");

  const xLabels = xLabelIdx
    .map((i) => {
      const x = xAt(i);
      return `<text x="${x.toFixed(2)}" y="${padT + plotH + 28}" text-anchor="middle" fill="${theme.label}" font-size="16" font-family="${FONT_XML}">${formatDay(days[i].date)}</text>`;
    })
    .join("\n    ");

  // Legend: rounded rect, red square, repo name — top-left inside plot
  const legendX = padL + 16;
  const legendY = padT + 12;
  const legendText = state.repo;
  // Rough width from character count (xkcd is wide)
  const legendW = Math.min(plotW - 32, Math.max(180, legendText.length * 10 + 48));
  const legendH = 36;

  const badgeDataUrl =
    opts?.avatarDataUrl === undefined && isWebcmd(state.repo)
      ? WEBCMD_LOGO_DATA_URL
      : opts?.avatarDataUrl;
  const avatarX = width / 2 - 90;
  const avatar = badgeDataUrl
    ? `<image href="${badgeDataUrl}" x="${avatarX}" y="14" width="28" height="28" clip-path="url(#avatarClip)"/>`
    : "";

  // The handwriting font has ~16 px of leading space before the visible glyph.
  const titleX = badgeDataUrl ? avatarX + 38 : width / 2;

  const css = embedFont ? fontFaceCss() : "";
  const styleBlock = css ? `<style>${css}</style>` : "";

  const wobbleDef =
    theme.wobble > 0
      ? `<filter id="${filterId}" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" result="noise"/>
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="${theme.wobble}" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <clipPath id="avatarClip"><circle cx="${width / 2 - 76}" cy="28" r="14"/></clipPath>`
      : `<clipPath id="avatarClip"><circle cx="${width / 2 - 76}" cy="28" r="14"/></clipPath>`;

  // Axis paths with a little overshoot like the reference
  const axisX = padL;
  const axisY0 = padT;
  const axisY1 = padT + plotH;
  const axisX1 = padL + plotW;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Star History — ${escapeXml(state.repo)}" style="stroke-width:3;font-family:${FONT_XML};background:${theme.background}">
  ${styleBlock}
  <defs>
    ${wobbleDef}
  </defs>
  <rect width="100%" height="100%" fill="${theme.background}"/>

  <!-- title -->
  ${avatar}
  <text x="${titleX}" y="36" text-anchor="${badgeDataUrl ? "start" : "middle"}" fill="${theme.title}" font-size="24" font-family="${FONT_XML}">Star History</text>

  <!-- y-axis label -->
  <text x="22" y="${padT + plotH / 2}" text-anchor="middle" fill="${theme.label}" font-size="16" font-family="${FONT_XML}" transform="rotate(-90 22 ${padT + plotH / 2})">GitHub Stars</text>

  <!-- x-axis label -->
  <text x="${padL + plotW / 2}" y="${height - 14}" text-anchor="middle" fill="${theme.label}" font-size="16" font-family="${FONT_XML}">Date</text>

  <!-- axes -->
  <g${filterAttr}>
    <path d="M${axisX},${axisY0} L${axisX},${axisY1} L${axisX1},${axisY1}" fill="none" stroke="${theme.axis}" stroke-width="3" stroke-linecap="square"/>
  </g>

  <!-- tick labels -->
  ${yLabels}
  ${xLabels}

  <!-- series line -->
  <g${filterAttr}>
    <path d="${lineD}" fill="none" stroke="${theme.line}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
  </g>

  <!-- legend -->
  <g>
    <rect x="${legendX}" y="${legendY}" width="${legendW}" height="${legendH}" rx="8" ry="8" fill="${theme.legendBg}" stroke="${theme.legendBorder}" stroke-width="2.5"/>
    <rect x="${legendX + 12}" y="${legendY + 11}" width="14" height="14" rx="2" fill="${theme.line}"/>
    <text x="${legendX + 34}" y="${legendY + 23}" fill="${theme.label}" font-size="15" font-family="${FONT_XML}">${escapeXml(legendText)}</text>
  </g>
</svg>
`;
}

function emptySvg(
  width: number,
  height: number,
  theme: ChartTheme,
  repo: string,
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="font-family:${FONT_XML};background:${theme.background}">
  <rect width="100%" height="100%" fill="${theme.background}"/>
  <text x="50%" y="50%" text-anchor="middle" fill="${theme.label}" font-size="18" font-family="${FONT_XML}">No star data yet for ${escapeXml(repo)}</text>
</svg>
`;
}

export function chartPaths(
  chartsDir: string,
  slug: string,
): { light: string; dark: string } {
  const { owner, repo } = parseRepo(slug);
  const base = join(chartsDir, owner, repo);
  return {
    light: `${base}.svg`,
    dark: `${base}-dark.svg`,
  };
}

/** Fetch owner avatar as a data URL for the title badge (best-effort). */
export async function fetchAvatarDataUrl(slug: string): Promise<string | undefined> {
  const { owner } = parseRepo(slug);
  try {
    const res = await fetch(`https://github.com/${owner}.png?size=56`, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "star-smooth-tracker" },
      redirect: "follow",
    });
    if (!res.ok) return undefined;
    const type = res.headers.get("content-type") || "image/png";
    if (!/^image\//i.test(type)) return undefined;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 500_000) return undefined;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return undefined;
  }
}

export async function writeCharts(
  chartsDir: string,
  state: TargetState,
  opts?: { avatarDataUrl?: string },
): Promise<{ light: string; dark: string }> {
  const paths = chartPaths(chartsDir, state.repo);
  mkdirSync(dirname(paths.light), { recursive: true });

  let avatar = opts?.avatarDataUrl;
  if (avatar === undefined && !isWebcmd(state.repo)) {
    avatar = await fetchAvatarDataUrl(state.repo);
  }

  writeFileSync(
    paths.light,
    renderStarSvg(state, { theme: LIGHT, avatarDataUrl: avatar }),
    "utf-8",
  );
  writeFileSync(
    paths.dark,
    renderStarSvg(state, { theme: DARK, avatarDataUrl: avatar }),
    "utf-8",
  );
  return paths;
}
