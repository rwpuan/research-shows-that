// OpenAlex query + abstract reconstruction.
// Docs: https://docs.openalex.org — free API, no key required (a mailto joins the "polite pool").

const BASE = "https://api.openalex.org/works";

// Seed topics rotated for variety. One is chosen per run (by date) so entries differ.
// Leaning toward curiosity-driven, "conversation starter" themes (Veritasium-style),
// while keeping a spread of serious fields too.
export const TOPICS = [
  "psychology", "behavioral economics", "nutrition", "sleep", "memory",
  "climate", "neuroscience", "microbiome", "cognitive science", "public health",
  "linguistics", "social behavior", "exercise physiology", "decision making",
  "circadian rhythm", "emotion", "habit formation", "attention", "aging",
  "biodiversity", "marine biology", "materials science", "astronomy", "epidemiology",
  "animal cognition", "dreams", "human perception", "music and the brain",
  "placebo effect", "procrastination", "misinformation", "sense of smell",
  "gut brain axis", "physics of everyday life", "creativity", "curiosity",
  "why humans", "surprising", "counterintuitive"
];

// Reconstruct plain text from OpenAlex's abstract_inverted_index (word -> [positions]).
export function reconstructAbstract(inverted) {
  if (!inverted) return "";
  const slots = [];
  for (const [word, positions] of Object.entries(inverted)) {
    for (const pos of positions) slots[pos] = word;
  }
  return slots.filter((w) => w !== undefined).join(" ").replace(/\s+/g, " ").trim();
}

function authorsOf(work) {
  return (work.authorships || [])
    .map((a) => a.author && a.author.display_name)
    .filter(Boolean);
}

// Query OpenAlex for one lesser-known, peer-reviewed, open-access journal article
// matching `topic`, skipping any OpenAlex id already in `usedIds`.
export async function findPaper({ topic, usedIds, mailto, page = 1 }) {
  const filters = [
    "type:article",
    "has_abstract:true",
    "is_oa:true",
    "primary_location.source.type:journal", // real journal, excludes preprint repositories
    "cited_by_count:15-250",                 // vetted but "lesser known"
    "from_publication_date:2012-01-01"
  ].join(",");

  const url = new URL(BASE);
  url.searchParams.set("filter", filters);
  url.searchParams.set("search", topic);
  url.searchParams.set("per_page", "50");
  url.searchParams.set("page", String(page));
  url.searchParams.set("sort", "relevance_score:desc");
  url.searchParams.set(
    "select",
    "id,doi,title,display_name,publication_year,cited_by_count,authorships,primary_location,open_access,abstract_inverted_index,type"
  );
  if (mailto) url.searchParams.set("mailto", mailto);

  const res = await fetch(url, { headers: { "User-Agent": `research-daily (${mailto || "no-mail"})` } });
  if (!res.ok) throw new Error(`OpenAlex ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const results = data.results || [];

  const used = new Set(usedIds || []);
  for (const w of results) {
    if (used.has(w.id)) continue;
    const abstract = reconstructAbstract(w.abstract_inverted_index);
    if (abstract.length < 350) continue; // need enough to summarize honestly
    const authors = authorsOf(w);
    if (!authors.length) continue;

    const source = (w.primary_location && w.primary_location.source) || {};
    const landing = (w.primary_location && w.primary_location.landing_page_url) || w.doi || w.id;

    return {
      abstract,
      paper: {
        title: w.display_name || w.title,
        authors,
        journal: source.display_name || "",
        year: w.publication_year || null,
        doi: w.doi || null,
        landing_url: landing,
        openalex_id: w.id,
        cited_by_count: typeof w.cited_by_count === "number" ? w.cited_by_count : null,
        is_open_access: !!(w.open_access && w.open_access.is_oa)
      }
    };
  }
  return null; // nothing fresh on this page
}
