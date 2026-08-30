# Star Smooth Tracker

Daily star-count tracker. Each target gets a **state file** plus a **stable chart
SVG** you can embed from another README.

History older than **5 days is locked**. The open window is
`shown = 0.75 * exponential_curve + 0.25 * raw` so late star dumps do not rewrite
the recent past as a straight line. **Today always pins** to the live star count.

Sample target: [`agentrhq/webcmd`](https://github.com/agentrhq/webcmd).

---

## Constant image URL (embed in webcmd)

Charts are overwritten in place every day. Filename never changes:

```
charts/agentrhq/webcmd.svg        # light (default embed)
charts/agentrhq/webcmd-dark.svg   # dark
```

### If this tracker repo is **public**

In the **webcmd** README:

```html
<!-- star history (smoothed) -->
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/<YOU>/<THIS-REPO>/main/charts/agentrhq/webcmd-dark.svg">
  <img alt="Star history" src="https://raw.githubusercontent.com/<YOU>/<THIS-REPO>/main/charts/agentrhq/webcmd.svg">
</picture>
```

Or plain markdown:

```markdown
![Star history](https://raw.githubusercontent.com/<YOU>/<THIS-REPO>/main/charts/agentrhq/webcmd.svg)
```

Replace `<YOU>/<THIS-REPO>` with your private tracker’s public mirror name if you
use one. GitHub caches `raw.githubusercontent.com` images; a push to the chart
file usually refreshes it within a few minutes (append `?v=1` only if stuck).

### If this tracker repo stays **private**

`raw.githubusercontent.com` links **do not render** for anonymous viewers on a
public webcmd README (they get a 404). Pick one:

1. **Recommended:** make the tracker repo **public** (only star totals + SVG;
   no secrets in the repo).
2. Or host the SVG on a public CDN / object storage each day (extra step).
3. Or keep the tracker private and only view charts while logged into GitHub.

The daily cron still works either way; only the *public embed* needs a public URL.

---

## Daily cron

Workflow: [`.github/workflows/daily-stars.yml`](.github/workflows/daily-stars.yml)

| trigger | when |
|---------|------|
| `schedule` | `19 7 * * *` (07:19 UTC daily) |
| `workflow_dispatch` | manual “Run workflow” button |

Each run:

1. Fetches live `stargazers_count` for every target in `targets.json`
2. Advances the 5-day lockup smooth into `data/<owner>/<repo>.json` (+ `.csv`)
3. Writes `charts/<owner>/<repo>.svg` and `-dark.svg` (same paths every day)
4. Commits and pushes

### Private-repo setup checklist

1. Push this repo to GitHub (private is fine for the job itself).
2. **Actions →** ensure Actions are enabled.
3. Add a PAT that can **read stargazers** on `agentrhq/webcmd` and **contents: write**
   is already granted to `GITHUB_TOKEN` for commits in *this* repo:
   - Repo **Settings → Secrets → Actions → New repository secret**
   - Name: `GH_PAT`
   - Value: classic token with `public_repo` (or fine-grained: read on webcmd +
     nothing else required for public webcmd; for private webcmd, Contents read)
4. Run **Daily star update** once via **Actions → Run workflow** to seed charts.
5. Paste the constant `raw.githubusercontent.com` URL into the webcmd README
   (repo must be public for that URL to work for everyone — see above).

Default `github.token` cannot always read another repo’s stargazers after GitHub’s
2026 restriction; `GH_PAT` from an account that owns/collaborates on webcmd fixes that.

---

## Smoothing

| knob | value |
|------|--------|
| lockup | 5 days |
| curve | \(y(t) = y_{\mathrm{lock}} + (y_{\mathrm{today}} - y_{\mathrm{lock}}) \cdot \frac{e^{2t}-1}{e^{2}-1}\) |
| mix | `shown = 0.75 * curve + 0.25 * raw` |
| today | pins to live star count |
| days 1–2 | raw |

---

## Layout

```
targets.json                      # repos to track
data/<owner>/<repo>.json          # raw + shown per day
data/<owner>/<repo>.csv
charts/<owner>/<repo>.svg         # ← constant URL (light)
charts/<owner>/<repo>-dark.svg    # ← constant URL (dark)
src/smooth.ts                     # lockup math
src/state.ts                      # state machine
src/chart.ts                      # SVG renderer
src/github.ts                     # star count + stargazer timestamps
src/bootstrap.ts                  # one-shot backfill
src/update.ts                     # daily entrypoint (CI)
src/render-charts.ts              # redraw SVGs from state only
```

## Local commands

```bash
npm install

# First time: real stargazer history → state + charts
npm run bootstrap -- --all

# Every day (same as CI)
npm run update

# Redraw SVGs without hitting the API
npm run charts

npm test
```

## Add a target

```json
{
  "targets": [
    {
      "url": "https://github.com/agentrhq/webcmd",
      "repo": "agentrhq/webcmd",
      "startDate": "2026-07-01"
    }
  ]
}
```

Then `npm run bootstrap -- --repo owner/repo --start YYYY-MM-DD`.

## License

MIT.
