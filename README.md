# Research shows that…

A lightweight webapp that surfaces **one lesser-known, peer-reviewed study per day**, summarized
in a ~3-minute read under a striking-but-honest *"Research shows that…"* headline — with clickable
links so anyone can deep-dive or fact-check.

- **No backend.** The site is plain HTML/CSS/JS. It just reads content files.
- **Autonomous.** A daily job picks a real paper from [OpenAlex](https://openalex.org), has Claude
  summarize *only its abstract*, and commits a new content file.
- **Credible by construction.** Every citation/DOI/link comes from OpenAlex metadata — never from
  the language model — so references can't be fabricated. The model only rewrites the abstract.
- Light/dark modes, clean reading typography, no images, share button.

## How it works

```
Static site (index.html)  ── reads ──▶  content/*.json  ◀── writes ──  scripts/generate.mjs
     served by GitHub Pages              (one file/day)                  OpenAlex → Claude
                                                                         run daily by GitHub Actions
```

- `index.html` / `style.css` / `app.js` — the reader. On load it picks the entry for today from
  `content/index.json` (falling back to the newest past entry if today's isn't published yet),
  renders it, and shows a source card with DOI/publisher/OpenAlex links.
- `content/` — `index.json` (manifest), `used.json` (OpenAlex ids already published, for dedup),
  and one `YYYY-MM-DD.json` per day.
- `scripts/` — the generator (`generate.mjs` + `lib/openalex.mjs` + `lib/summarize.mjs`).
- `.github/workflows/daily.yml` — the cron that runs the generator and deploys Pages.

## Content file shape (`content/YYYY-MM-DD.json`)

```json
{
  "date": "2026-07-04",
  "headline": "Research shows that ...",
  "dek": "one sober line on the actual finding",
  "summary_md": "## What they found ... ## How they studied it ... ## Caveats & limits ... ## Why it matters",
  "read_minutes": 3,
  "topic": "Psychology",
  "paper": { "title": "...", "authors": ["..."], "journal": "...", "year": 2016,
             "doi": "https://doi.org/...", "landing_url": "...", "openalex_id": "https://openalex.org/W...",
             "cited_by_count": 109, "is_open_access": true }
}
```

## Run it locally

Serve the static site (any static server works):

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Generate a fresh entry (writes a new `content/*.json`):

```bash
cd scripts
npm install
ANTHROPIC_API_KEY=sk-ant-... OPENALEX_MAILTO=you@example.com node generate.mjs
```

Useful env vars:
- `ANTHROPIC_API_KEY` — required for the summary.
- `OPENALEX_MAILTO` — your email; joins OpenAlex's faster "polite pool" (recommended).
- `CLAUDE_MODEL` — defaults to `claude-sonnet-4-6`; set `claude-haiku-4-5` to cut cost.
- `DATE=YYYY-MM-DD` — generate for a specific date (backfill/testing).

## Deploy (GitHub Pages + Actions — free, autonomous)

1. Push this repo to GitHub.
2. **Settings → Pages → Source = GitHub Actions.**
3. **Settings → Secrets and variables → Actions** → add:
   - `ANTHROPIC_API_KEY`
   - `OPENALEX_MAILTO` (your email)
4. The workflow runs daily at 06:00 UTC (or trigger it manually via **Actions → Publish daily
   research → Run workflow**). Each run generates a new entry, commits it, and redeploys.

Your site goes live at `https://<user>.github.io/<repo>/`. The daily commit also keeps the cron
alive (GitHub only pauses schedules after 60 days of no repo activity).

## Cost

Hosting is **$0**. OpenAlex is free. The one Claude call per day is a fraction of a cent (Haiku) to
a few cents (Sonnet) — well under $1/month.

## A note on credibility

Summaries are generated from each paper's own abstract and are meant as a pointer, not a substitute
for the source. Always read the linked paper before citing a finding. The app targets journal
articles with modest citation counts (real and vetted, but lesser-known) and always surfaces a
"Caveats & limits" section.
