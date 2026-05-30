import { describe, expect, it } from "vitest";
import {
  aggregateEvidenceQuality,
  calculateConfidence,
  calculateRiskScore,
  enrichSignalEvidence,
  enrichSourceEvidence,
  evidenceGradeForScore,
  evidenceQualityForSource
} from "@/lib/scoring";
import type { RiskSignal, SourceDocument } from "@/lib/types";

function source(overrides: Partial<SourceDocument> = {}): SourceDocument {
  return {
    id: "src_1",
    url: "https://example.com/security",
    title: "Security report",
    sourceType: "official",
    fetchedText: "Security report mentions incident response and compliance controls.",
    brightDataMethod: "Seeded Cache",
    fetchedAt: "2026-05-20T00:00:00.000Z",
    authorityScore: 90,
    recencyScore: 80,
    directnessScore: 90,
    reliabilityScore: 85,
    evidenceGrade: "Strong",
    evidenceReasoning: "Strong evidence for test.",
    ...overrides
  };
}

function signal(overrides: Partial<RiskSignal> = {}): RiskSignal {
  return {
    id: "sig_1",
    category: "Security",
    severity: 8,
    summary: "Security incident signal",
    sourceUrl: "https://example.com/security",
    evidenceSnippet: "Incident response evidence",
    sourceAuthority: 90,
    recency: 80,
    corroborationCount: 2,
    confidence: 82,
    ...overrides
  };
}

describe("risk scoring", () => {
  it("scores evidence quality from source authority, recency, directness, and reliability", () => {
    expect(evidenceQualityForSource(source())).toBe(87);
  });

  it("assigns source-level evidence grades and reasoning", () => {
    const strong = enrichSourceEvidence(source());
    const weak = enrichSourceEvidence(source({
      authorityScore: 32,
      recencyScore: 25,
      directnessScore: 35,
      reliabilityScore: 40
    }));

    expect(strong.evidenceGrade).toBe("Strong");
    expect(strong.evidenceReasoning).toContain("Strong evidence");
    expect(weak.evidenceGrade).toBe("Weak");
    expect(evidenceGradeForScore(60)).toBe("Moderate");
  });

  it("rolls source grade into signal evidence reasoning", () => {
    const enrichedSource = enrichSourceEvidence(source());
    const enrichedSignal = enrichSignalEvidence(signal(), [enrichedSource]);

    expect(enrichedSignal.evidenceGrade).toBe("Strong");
    expect(enrichedSignal.evidenceReasoning).toContain("source grade Strong");
  });

  it("lowers confidence when severe risk has weak evidence", () => {
    const strongSource = source();
    const weakSource = source({
      url: "https://forum.example/post",
      sourceType: "unknown",
      authorityScore: 28,
      recencyScore: 30,
      directnessScore: 25,
      reliabilityScore: 25
    });
    const strongSignal = signal();
    const weakSignal = signal({
      sourceUrl: weakSource.url,
      sourceAuthority: 28,
      recency: 30,
      corroborationCount: 0,
      confidence: 30
    });

    const strongEvidence = aggregateEvidenceQuality([strongSource], [strongSignal]);
    const weakEvidence = aggregateEvidenceQuality([weakSource], [weakSignal]);

    expect(calculateConfidence([weakSignal], [weakSource], weakEvidence)).toBeLessThan(
      calculateConfidence([strongSignal], [strongSource], strongEvidence)
    );
    expect(calculateRiskScore([weakSignal], weakEvidence)).toBeLessThan(
      calculateRiskScore([strongSignal], strongEvidence)
    );
  });
});
