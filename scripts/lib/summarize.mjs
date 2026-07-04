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

ANGLE — think shareable science fact (the Veritasium / "wait, that's real?" vibe): find the single
most surprising, counterintuitive, or delightful thing the paper genuinely shows, and lead with it.
The goal is a fact a reader would actually repeat to a friend, use as a conversation starter, or
turn into a short. The surprise must come from the REAL finding — never from exaggeration. If the
study is sober or technical, find the honestly-interesting hook; do not manufacture drama.

Hard rules:
- Ground every claim ONLY in the provided abstract. Do NOT invent statistics, numbers, sample
  sizes, mechanisms, or findings that are not in the abstract.
- Middle-ground tone: the headline may be striking but must be TRUE to the abstract. Never
  overclaim, never imply certainty the abstract doesn't support.
- HEADLINE LENGTH: keep it a single tight clause, at most ~12 words / ~80 characters. No trailing
  "with…" clauses, no lists, no semicolons or em-dashes, no sub-clauses. Put all nuance,
  qualifiers, and scope in the dek instead — never in the headline.
- Always include a "Caveats & limits" section that flags what the abstract does not establish.
- No medical, legal, or financial advice. Describe findings; don't prescribe actions.
- Do NOT fabricate authors, journals, DOIs, or links — you are not given those to output.

Return your answer by calling the emit_digest tool. Field guidance:
- headline: ONE tight clause, max ~12 words / ~80 chars, starts with "Research shows that".
- dek: one sober sentence stating the actual finding and its scope.
- summary_md: markdown body, ~450-650 words, ~3-min read.
- read_minutes: integer, usually 3.
- talking_point: ONE casual, punchy sentence the reader could actually say out loud to start a
  conversation — e.g. "Did you know…" / "Turns out…" / "Next time someone says X, tell them…".
  Light, repeatable, and true to the finding. Max ~30 words. No citations or hedging jargon here.

The summary_md MUST use these section headings in this order:
## What they found
## How they studied it
## Caveats & limits
## Why it matters

Use short paragraphs and occasional bold. Do not include the paper's title/authors/links in the
body (those are shown separately).`;

const DIGEST_TOOL = {
  name: "emit_digest",
  description: "Return the finished daily research digest.",
  input_schema: {
    type: "object",
    properties: {
      headline: { type: "string", description: "One tight clause, starts with 'Research shows that'." },
      dek: { type: "string", description: "One sober sentence on the finding and its scope." },
      summary_md: { type: "string", description: "Markdown body with the four required section headings." },
      read_minutes: { type: "integer", description: "Estimated read time in minutes." },
      talking_point: { type: "string", description: "One casual, repeatable sentence to start a conversation, true to the finding." }
    },
    required: ["headline", "dek", "summary_md", "read_minutes", "talking_point"]
  }
};

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

Call emit_digest with the digest now.`;

  // Structured tool output: the API returns an already-parsed object, so free-text
  // fields (which may contain quotes, newlines, etc.) never have to survive JSON.parse.
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 1600,
    system: SYSTEM,
    tools: [DIGEST_TOOL],
    tool_choice: { type: "tool", name: "emit_digest" },
    messages: [{ role: "user", content: userMsg }]
  });

  const toolUse = resp.content.find((b) => b.type === "tool_use" && b.name === "emit_digest");
  if (!toolUse) {
    throw new Error("Model did not call emit_digest:\n" + JSON.stringify(resp.content));
  }
  const parsed = toolUse.input;

  if (!parsed.headline || !parsed.summary_md) {
    throw new Error("Digest missing required fields: " + JSON.stringify(parsed));
  }
  if (!/^research shows that/i.test(parsed.headline)) {
    parsed.headline = "Research shows that " + parsed.headline.replace(/^[A-Z]/, (c) => c.toLowerCase());
  }
  return {
    headline: parsed.headline.trim(),
    dek: (parsed.dek || "").trim(),
    summary_md: parsed.summary_md.trim(),
    talking_point: (parsed.talking_point || "").trim(),
    read_minutes: Number(parsed.read_minutes) || 3
  };
}
