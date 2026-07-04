// Turn a real paper's abstract into a grounded, honest daily entry using the Claude API.
// The model ONLY rewrites the provided abstract. All citations/links are attached by the
// caller from OpenAlex metadata — never taken from the model — so references can't be faked.

import Anthropic from "@anthropic-ai/sdk";

// Sonnet balances quality and cost; ~1 call/day makes cost negligible.
// Swap to "claude-haiku-4-5" to minimize cost further.
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";

const SYSTEM = `You are the editor of a daily "lesser-known research" digest. You are given the
ABSTRACT and basic metadata of ONE real, peer-reviewed journal article. Write a short, honest,
engaging digest of THAT paper for a curious general audience.

Hard rules:
- Ground every claim ONLY in the provided abstract. Do NOT invent statistics, numbers, sample
  sizes, mechanisms, or findings that are not in the abstract.
- Middle-ground tone: the headline may be striking but must be TRUE to the abstract. Never
  overclaim, never imply certainty the abstract doesn't support.
- Always include a "Caveats & limits" section that flags what the abstract does not establish.
- No medical, legal, or financial advice. Describe findings; don't prescribe actions.
- Do NOT fabricate authors, journals, DOIs, or links — you are not given those to output.

Output STRICT JSON only (no markdown fence) with this shape:
{
  "headline": "Research shows that ...",   // one striking-but-honest sentence, starts with "Research shows that"
  "dek": "one sober sentence stating the actual finding and its scope",
  "summary_md": "markdown body, ~450-650 words, ~3-min read",
  "read_minutes": 3
}

The summary_md MUST use these section headings in this order:
## What they found
## How they studied it
## Caveats & limits
## Why it matters

Use short paragraphs and occasional bold. Do not include the paper's title/authors/links in the
body (those are shown separately).`;

export async function summarize({ abstract, paper }) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const userMsg = `Metadata (for context only — do not restate the links):
Title: ${paper.title}
Journal: ${paper.journal || "unknown"}
Year: ${paper.year || "unknown"}

ABSTRACT:
"""
${abstract}
"""

Write the digest as strict JSON now.`;

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 1600,
    system: SYSTEM,
    messages: [{ role: "user", content: userMsg }]
  });

  const text = resp.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  const jsonStr = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error("Model did not return valid JSON:\n" + text);
  }

  if (!parsed.headline || !parsed.summary_md) {
    throw new Error("Model JSON missing required fields: " + text);
  }
  if (!/^research shows that/i.test(parsed.headline)) {
    parsed.headline = "Research shows that " + parsed.headline.replace(/^[A-Z]/, (c) => c.toLowerCase());
  }
  return {
    headline: parsed.headline.trim(),
    dek: (parsed.dek || "").trim(),
    summary_md: parsed.summary_md.trim(),
    read_minutes: Number(parsed.read_minutes) || 3
  };
}
