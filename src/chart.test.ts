/** SVG serialization regression tests. Run: npx tsx src/chart.test.ts */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { renderStarSvg, DARK } from "./chart";
import type { TargetState } from "./state";

const state: TargetState = {
  version: 1,
  repo: "agentrhq/webcmd",
  url: "https://github.com/agentrhq/webcmd",
  startDate: "2026-08-20",
  updatedAt: "2026-08-22T00:00:00.000Z",
  lockupDays: 5,
  days: [
    { date: "2026-08-20", raw: 100, shown: 100 },
    { date: "2026-08-21", raw: 105, shown: 105 },
  ],
};

const svg = renderStarSvg(state, { theme: DARK, embedFont: false });

if (!svg.includes('href="data:image/png;base64,')) {
  process.stderr.write("FAIL webcmd chart uses the embedded PNG project logo\n");
  process.exit(1);
}
const logo = /href="data:image\/png;base64,([^"]+)"/.exec(svg)?.[1];
const logoHash = logo
  ? createHash("sha256").update(Buffer.from(logo, "base64")).digest("hex")
  : "";
if (logoHash !== "6b4d8df65223f646d7505cefe12a8f7a76de18c984749421912dc6738a0ee1e7") {
  process.stderr.write("FAIL webcmd chart uses the canonical WebCMD logo\n");
  process.exit(1);
}
if (!svg.includes('<text x="348" y="36"')) {
  process.stderr.write("FAIL webcmd chart keeps the title close to the logo\n");
  process.exit(1);
}
process.stdout.write("ok   webcmd chart uses the embedded PNG project logo\n");
process.stdout.write("ok   webcmd chart keeps the title close to the logo\n");

try {
  execFileSync("xmllint", ["--noout", "-"], { input: svg, stdio: "pipe" });
  process.stdout.write("ok   dark chart is valid XML\n");
} catch (error) {
  process.stderr.write("FAIL dark chart is valid XML\n");
  process.stderr.write(String(error));
  process.exit(1);
}
