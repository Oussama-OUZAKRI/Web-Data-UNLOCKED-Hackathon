import type { EvidenceGrade, RiskRating, RiskReport, RiskSignal, SourceDocument } from "@/lib/types";

const CATEGORY_WEIGHTS: Record<RiskSignal["category"], number> = {
  Security: 1.35,
  Legal: 1.25,
  Regulatory: 1.25,
  Financial: 1.15,
  Operational: 1,
  Leadership: 0.8,
  Reputation: 0.9,
  Service: 1
};

export function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function evidenceQualityForSource(source: SourceDocument) {
  return clamp(
    source.authorityScore * 0.35 +
      source.recencyScore * 0.25 +
      source.directnessScore * 0.25 +
      source.reliabilityScore * 0.15
  );
}

export function evidenceGradeForScore(score: number): EvidenceGrade {
  if (score >= 78) return "Strong";
  if (score >= 56) return "Moderate";
  return "Weak";
}

export function evidenceReasoningForSource(source: SourceDocument) {
  const quality = evidenceQualityForSource(source);
  const grade = evidenceGradeForScore(quality);
  const strengths = [
    source.authorityScore >= 80 ? "high-authority source" : "",
    source.directnessScore >= 80 ? "directly tied to the vendor" : "",
    source.recencyScore >= 75 ? "recent enough for procurement review" : "",
    source.reliabilityScore >= 80 ? "reliable retrieval method" : ""
  ].filter(Boolean);
  const weaknesses = [
    source.authorityScore < 60 ? "lower-authority source" : "",
    source.directnessScore < 65 ? "indirect vendor relevance" : "",
    source.recencyScore < 60 ? "stale or undated evidence" : "",
    source.reliabilityScore < 70 ? "retrieval reliability is limited" : ""
  ].filter(Boolean);
  const detail = strengths.length > 0 ? strengths.join(", ") : weaknesses.join(", ") || "mixed evidence quality";

  return `${grade} evidence (${quality}/100): ${detail}.`;
}

export function enrichSourceEvidence(source: SourceDocument): SourceDocument {
  const score = evidenceQualityForSource(source);
  return {
    ...source,
    evidenceGrade: evidenceGradeForScore(score),
    evidenceReasoning: evidenceReasoningForSource(source)
  };
}

export function evidenceGradeForSignal(signal: RiskSignal, sources: SourceDocument[]) {
  const source = sources.find((candidate) => candidate.url === signal.sourceUrl);
  const sourceScore = source ? evidenceQualityForSource(source) : (signal.sourceAuthority + signal.recency + signal.confidence) / 3;
  const corroborationLift = Math.min(10, signal.corroborationCount * 4);
  const confidenceAdjustment = (signal.confidence - 50) * 0.2;
  return evidenceGradeForScore(clamp(sourceScore + corroborationLift + confidenceAdjustment));
}

export function evidenceReasoningForSignal(signal: RiskSignal, sources: SourceDocument[]) {
  const source = sources.find((candidate) => candidate.url === signal.sourceUrl);
  const sourceGrade = source?.evidenceGrade ?? evidenceGradeForSignal(signal, sources);
  const corroboration =
    signal.corroborationCount > 1
      ? `${signal.corroborationCount} corroborating references`
      : "single-source support";
  return `${sourceGrade} signal support: ${corroboration}, ${signal.confidence}/100 extraction confidence${source ? `, source grade ${source.evidenceGrade}` : ""}.`;
}

export function enrichSignalEvidence(signal: RiskSignal, sources: SourceDocument[]): RiskSignal {
  return {
    ...signal,
    evidenceGrade: evidenceGradeForSignal(signal, sources),
    evidenceReasoning: evidenceReasoningForSignal(signal, sources)
  };
}

export function aggregateEvidenceQuality(sources: SourceDocument[], signals: RiskSignal[]) {
  if (sources.length === 0) return 0;

  const signalUrls = new Set(signals.map((signal) => signal.sourceUrl));
  const relevantSources = sources.filter((source) => signalUrls.has(source.url));
  const scoredSources = relevantSources.length > 0 ? relevantSources : sources;
  const average =
    scoredSources.reduce((sum, source) => sum + evidenceQualityForSource(source), 0) /
    scoredSources.length;

  const corroborationBonus = Math.min(12, signals.reduce((sum, signal) => sum + signal.corroborationCount, 0) * 2);
  const sparsePenalty = scoredSources.length < 3 ? 10 : 0;

  return clamp(average + corroborationBonus - sparsePenalty);
}

export function calculateRiskScore(signals: RiskSignal[], evidenceQuality: number) {
  if (signals.length === 0) return 18;

  const weightedSeverity = signals.reduce((sum, signal) => {
    return sum + signal.severity * CATEGORY_WEIGHTS[signal.category] * (0.65 + signal.confidence / 200);
  }, 0);
  const normalized = Math.min(100, weightedSeverity / Math.max(1, signals.length) * 11.5);
  const highRiskSignals = signals.filter((signal) => signal.severity >= 7).length;
  const severityLift = Math.min(18, highRiskSignals * 5);
  const weakEvidenceDampener = evidenceQuality < 45 ? 0.78 : evidenceQuality < 60 ? 0.9 : 1;

  return clamp((normalized + severityLift) * weakEvidenceDampener);
}

export function calculateConfidence(signals: RiskSignal[], sources: SourceDocument[], evidenceQuality: number) {
  if (sources.length === 0) return 0;

  const signalConfidence =
    signals.length > 0
      ? signals.reduce((sum, signal) => sum + signal.confidence, 0) / signals.length
      : 40;
  const coverage = clamp(Math.min(100, sources.length * 16 + signals.length * 8));
  const corroboration = clamp(signals.reduce((sum, signal) => sum + signal.corroborationCount, 0) * 10);

  return clamp(evidenceQuality * 0.5 + signalConfidence * 0.25 + coverage * 0.15 + corroboration * 0.1);
}

export function riskRating(score: number): RiskRating {
  if (score >= 82) return "Critical";
  if (score >= 62) return "High";
  if (score >= 36) return "Medium";
  return "Low";
}

export function buildFallbackReport(
  vendorName: string,
  signals: RiskSignal[],
  sources: SourceDocument[]
): RiskReport {
  const evidenceQuality = aggregateEvidenceQuality(sources, signals);
  const score = calculateRiskScore(signals, evidenceQuality);
  const confidence = calculateConfidence(signals, sources, evidenceQuality);
  const highest = [...signals].sort((a, b) => b.severity - a.severity)[0];
  const rating = riskRating(score);

  return {
    score,
    rating,
    confidence,
    evidenceQuality,
    whyThisMatters:
      highest != null
        ? `${vendorName} is currently rated ${rating} risk because the investigation found ${highest.category.toLowerCase()} signals that could affect onboarding, contract terms, or ongoing vendor monitoring. Procurement should treat this as decision support: validate the cited evidence, ask for current compliance documents, and route material concerns to the responsible security or legal owner before expanding usage.`
        : `${vendorName} has limited public risk evidence in this run. Procurement can continue evaluation, but should request standard security and compliance documentation because low signal volume can reduce visibility rather than prove low exposure.`,
    actions: [
      "Request current SOC 2, ISO 27001, or equivalent assurance documents.",
      "Ask the vendor to respond to the highest-severity findings with dated evidence.",
      rating === "High" || rating === "Critical"
        ? "Escalate legal/security review before signing or renewal."
        : "Keep standard vendor due diligence and monitor for new public signals."
    ],
    watchlistTriggers: [
      "New breach, CVE, or incident mention tied to the vendor.",
      "New lawsuit, regulatory action, or sanctions reference.",
      "Material change to pricing, service availability, leadership, or support posture."
    ]
  };
}
