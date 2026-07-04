// Daily generator: pick a real paper -> summarize -> write a dated content file.
// Run: node scripts/generate.mjs   (needs ANTHROPIC_API_KEY; OPENALEX_MAILTO recommended)

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TOPICS, findPaper } from "./lib/openalex.mjs";
import { summarize } from "./lib/summarize.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(__dirname, "..", "content");
const MAILTO = process.env.OPENALEX_MAILTO || "";

function todayISO() {
  // Allow override via DATE=YYYY-MM-DD for backfilling/testing.
  if (process.env.DATE) return process.env.DATE;
  return new Date().toISOString().slice(0, 10);
}

async function readJSON(path, fallback) {
  if (!existsSync(path)) return fallback;
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch { return fallback; }
}

// Deterministic-ish topic pick from the date, so reruns of the same day are stable
// but consecutive days rotate.
function topicForDate(dateStr) {
  const n = dateStr.split("-").reduce((a, p) => a + Number(p), 0);
  return TOPICS[n % TOPICS.length];
}

async function main() {
  const date = todayISO();
  const outPath = join(CONTENT_DIR, `${date}.json`);
  if (existsSync(outPath)) {
    console.log(`✓ ${date} already exists — nothing to do.`);
    return;
  }

  await mkdir(CONTENT_DIR, { recursive: true });
  const manifest = await readJSON(join(CONTENT_DIR, "index.json"), []);
  const used = await readJSON(join(CONTENT_DIR, "used.json"), []);

  // Try the day's topic across a few pages, then fall back through other topics.
  const primary = topicForDate(date);
  const order = [primary, ...TOPICS.filter((t) => t !== primary)];

  let found = null;
  outer:
  for (const topic of order) {
    for (let page = 1; page <= 3; page++) {
      const hit = await findPaper({ topic, usedIds: used, mailto: MAILTO, page });
      if (hit) { found = { ...hit, topic }; break outer; }
    }
  }

  if (!found) {
    console.error("✗ No fresh paper found across all topics. Aborting without changes.");
    process.exit(1);
  }

  console.log(`→ Selected: ${found.paper.title} (${found.paper.journal}, ${found.paper.year})`);

  const written = await summarize({ abstract: found.abstract, paper: found.paper });

  const entry = {
    date,
    headline: written.headline,
    dek: written.dek,
    read_minutes: written.read_minutes,
    topic: found.topic.replace(/\b\w/g, (c) => c.toUpperCase()),
    summary_md: written.summary_md,
    paper: found.paper // links/metadata straight from OpenAlex, not the model
  };

  await writeFile(outPath, JSON.stringify(entry, null, 2) + "\n");

  const nextManifest = [
    { date, slug: date, headline: entry.headline },
    ...manifest.filter((m) => m.date !== date)
  ].sort((a, b) => (a.date < b.date ? 1 : -1));
  await writeFile(join(CONTENT_DIR, "index.json"), JSON.stringify(nextManifest, null, 2) + "\n");

  const nextUsed = Array.from(new Set([...used, found.paper.openalex_id]));
  await writeFile(join(CONTENT_DIR, "used.json"), JSON.stringify(nextUsed, null, 2) + "\n");

  console.log(`✓ Wrote content/${date}.json`);
  console.log(`  ${entry.headline}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
