import type { CandidateUrl, InvestigationInput, SelectedSource, SourceDocument, SourceType } from "@/lib/types";
import { normalizeDomain, normalizeUrl, safeHost, uid } from "@/lib/utils";

const SOURCE_TYPE_WEIGHT: Record<SourceType, number> = {
  regulatory: 36,
  security: 34,
  official: 32,
  legal: 28,
  news: 24,
  market: 18,
  review: 12,
  unknown: 6
};

const RISK_KEYWORDS = [
  "breach",
  "incident",
  "security",
  "lawsuit",
  "regulatory",
  "investigation",
  "outage",
  "status",
  "soc 2",
  "iso 27001",
  "trust",
  "layoff",
  "financial",
  "compliance"
];

export interface RankedCandidate {
  candidate: CandidateUrl;
  score: number;
  reason: string;
}

export interface SourceSelection {
  selected: RankedCandidate[];
  skipped: RankedCandidate[];
  selectedSources: SelectedSource[];
}

export function rankCandidateSources(
  candidates: CandidateUrl[],
  input: InvestigationInput,
  existingSources: SourceDocument[] = []
): RankedCandidate[] {
  const fetched = new Set(existingSources.map((source) => normalizeUrl(source.url)));
  const vendorDomain = normalizeDomain(input.domain);
  const focusTerms = terms(`${input.vendorName} ${input.domain ?? ""} ${input.riskFocus ?? ""}`);

  return candidates
    .filter((candidate) => !fetched.has(normalizeUrl(candidate.url)))
    .map((candidate) => {
      const host = safeHost(candidate.url);
      const haystack = `${candidate.title} ${candidate.url}`.toLowerCase();
      const vendorMatch = vendorDomain && host.endsWith(vendorDomain) ? 22 : 0;
      const riskHits = RISK_KEYWORDS.filter((keyword) => haystack.includes(keyword)).length;
      const focusHits = focusTerms.filter((term) => term.length > 3 && haystack.includes(term)).length;
      const score =
        SOURCE_TYPE_WEIGHT[candidate.sourceType] +
        vendorMatch +
        Math.min(24, riskHits * 6) +
        Math.min(14, focusHits * 3) -
        lowValuePenalty(candidate.url);

      return {
        candidate,
        score,
        reason: selectionReason(candidate, score, vendorMatch > 0, riskHits, focusHits)
      };
    })
    .sort((a, b) => b.score - a.score);
}

export function selectCandidateSources(
  requestedUrls: string[],
  candidates: CandidateUrl[],
  input: InvestigationInput,
  existingSources: SourceDocument[],
  limit = 3
): SourceSelection {
  const ranked = rankCandidateSources(candidates, input, existingSources);
  const requested = new Set(requestedUrls.map(normalizeUrl));
  const requestedRanked = ranked.filter(({ candidate }) => requested.has(normalizeUrl(candidate.url)));
  const pool = requestedRanked.length > 0 ? requestedRanked : ranked;
  const selected = pool.slice(0, limit);
  const selectedUrls = new Set(selected.map(({ candidate }) => normalizeUrl(candidate.url)));
  const skipped = ranked.filter(({ candidate }) => !selectedUrls.has(normalizeUrl(candidate.url))).slice(0, 5);

  return {
    selected,
    skipped,
    selectedSources: [
      ...selected.map(({ candidate, reason }) => selectedSource(candidate, reason, "selected")),
      ...skipped.map(({ candidate, reason }) => selectedSource(candidate, `Skipped: ${reason}`, "skipped"))
    ]
  };
}

function selectedSource(candidate: CandidateUrl, selectionReason: string, status: SelectedSource["status"]): SelectedSource {
  return {
    id: uid("sel"),
    url: candidate.url,
    title: candidate.title,
    sourceType: candidate.sourceType,
    selectionReason,
    status
  };
}

function selectionReason(candidate: CandidateUrl, score: number, vendorMatch: boolean, riskHits: number, focusHits: number) {
  const reasons = [`${candidate.sourceType} source scored ${Math.round(score)}`];
  if (vendorMatch) reasons.push("vendor-domain match");
  if (riskHits > 0) reasons.push(`${riskHits} risk keyword${riskHits === 1 ? "" : "s"}`);
  if (focusHits > 0) reasons.push(`${focusHits} focus-term match${focusHits === 1 ? "" : "es"}`);
  return reasons.join("; ");
}

function lowValuePenalty(url: string) {
  const lower = url.toLowerCase();
  if (lower.includes("/login") || lower.includes("/signup") || lower.includes("/careers")) return 18;
  if (lower.includes("facebook.com") || lower.includes("linkedin.com") || lower.includes("twitter.com")) return 12;
  return 0;
}

function terms(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}
