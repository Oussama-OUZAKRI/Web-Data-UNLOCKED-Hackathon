import { generateObject } from "ai";
import { z } from "zod";
import type { InvestigationInput, RiskReport, RiskSignal, SourceDocument } from "@/lib/types";
import { hasLlmConfig, llmModel } from "@/lib/llm-provider";
import { buildFallbackReport, enrichSignalEvidence } from "@/lib/scoring";
import { uid } from "@/lib/utils";

const signalSchema = z.object({
  signals: z.array(
    z.object({
      category: z.enum(["Security", "Legal", "Regulatory", "Financial", "Operational", "Leadership", "Reputation", "Service"]),
      severity: z.number().min(1).max(10),
      summary: z.string().min(8),
      sourceUrl: z.string().url(),
      evidenceSnippet: z.string().min(8),
      corroborationCount: z.number().min(0).max(10),
      confidence: z.number().min(0).max(100)
    })
  )
});

const reportSchema = z.object({
  whyThisMatters: z.string().min(80),
  actions: z.array(z.string().min(8)).min(3).max(5),
  watchlistTriggers: z.array(z.string().min(8)).min(3).max(5)
});

export async function extractSignals(input: InvestigationInput, sources: SourceDocument[]): Promise<RiskSignal[]> {
  if (!hasLlmConfig() || sources.length === 0) {
    return heuristicSignals(sources);
  }

  try {
    const { object } = await generateObject({
      model: llmModel(),
      schema: signalSchema,
      prompt: [
        `Extract vendor risk signals for ${input.vendorName}.`,
        "Use only the provided public-source evidence. Do not invent facts.",
        "Prefer procurement, compliance, security, financial, operational, legal, and service-continuity risks.",
        "Return concise evidence snippets copied or closely paraphrased from the source text.",
        JSON.stringify(
          sources.map((source) => ({
            url: source.url,
            title: source.title,
            sourceType: source.sourceType,
            authorityScore: source.authorityScore,
            text: source.fetchedText.slice(0, 1800)
          }))
        )
      ].join("\n\n")
    });

    return object.signals.map((signal) => {
      const source = sources.find((candidate) => candidate.url === signal.sourceUrl) ?? sources[0];
      return enrichSignalEvidence({
        id: uid("sig"),
        category: signal.category,
        severity: signal.severity,
        summary: signal.summary,
        sourceUrl: signal.sourceUrl,
        evidenceSnippet: signal.evidenceSnippet,
        sourceAuthority: source.authorityScore,
        recency: source.recencyScore,
        corroborationCount: signal.corroborationCount,
        confidence: signal.confidence
      }, sources);
    });
  } catch {
    return heuristicSignals(sources);
  }
}

export async function generateRiskMemo(
  input: InvestigationInput,
  sources: SourceDocument[],
  signals: RiskSignal[],
  baseReport: RiskReport
): Promise<RiskReport> {
  if (!hasLlmConfig()) {
    return baseReport;
  }

  try {
    const { object } = await generateObject({
      model: llmModel(),
      schema: reportSchema,
      prompt: [
        `Write a procurement and compliance memo for ${input.vendorName}.`,
        `Risk score: ${baseReport.score}/100, rating: ${baseReport.rating}, confidence: ${baseReport.confidence}/100, evidence quality: ${baseReport.evidenceQuality}/100.`,
        "Explain why the risk matters to a buyer. Answer what could go wrong, which team should care, what decision it affects, and what to do next.",
        "Use only these signals:",
        JSON.stringify(signals.map(({ category, severity, summary, evidenceSnippet }) => ({ category, severity, summary, evidenceSnippet }))),
        "Available source count: " + sources.length
      ].join("\n\n")
    });

    return {
      ...baseReport,
      whyThisMatters: object.whyThisMatters,
      actions: object.actions,
      watchlistTriggers: object.watchlistTriggers
    };
  } catch {
    return baseReport;
  }
}

function heuristicSignals(sources: SourceDocument[]): RiskSignal[] {
  const keywords = [
    { category: "Security" as const, words: ["breach", "incident", "security", "cve"], severity: 7 },
    { category: "Legal" as const, words: ["lawsuit", "court", "settlement"], severity: 7 },
    { category: "Regulatory" as const, words: ["regulatory", "investigation", "notice"], severity: 7 },
    { category: "Financial" as const, words: ["layoff", "distress", "bankruptcy"], severity: 6 },
    { category: "Service" as const, words: ["outage", "disruption", "status"], severity: 6 },
    { category: "Operational" as const, words: ["support", "delay", "roadmap"], severity: 4 }
  ];

  const signals: RiskSignal[] = [];

  for (const source of sources) {
    const lower = source.fetchedText.toLowerCase();
    for (const rule of keywords) {
      const matched = rule.words.find((word) => lower.includes(word));
      if (!matched) continue;
      const index = lower.indexOf(matched);
      const snippet = source.fetchedText.slice(Math.max(0, index - 80), index + 180);
      signals.push(enrichSignalEvidence({
        id: uid("sig"),
        category: rule.category,
        severity: rule.severity,
        summary: `${rule.category} signal found in ${source.title}.`,
        sourceUrl: source.url,
        evidenceSnippet: snippet || source.fetchedText.slice(0, 220),
        sourceAuthority: source.authorityScore,
        recency: source.recencyScore,
        corroborationCount: Math.max(1, sources.filter((candidate) => candidate.sourceType === source.sourceType).length - 1),
        confidence: Math.round((source.authorityScore + source.reliabilityScore) / 2)
      }, sources));
      break;
    }
  }

  if (signals.length > 0) return signals.slice(0, 8);
  return buildFallbackReport("Vendor", [], sources).score > 0 ? [] : [];
}
