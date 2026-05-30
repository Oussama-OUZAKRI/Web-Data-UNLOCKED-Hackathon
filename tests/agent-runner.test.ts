import { describe, expect, it } from "vitest";
import { AGENT_BUDGET, emptyBudgetUsage } from "@/lib/agent-metadata";
import { completionTypeForStopReason, hasSufficientEvidence, isBudgetExhausted, stopDetail } from "@/lib/agent-runner";
import { createSeededInvestigation } from "@/lib/seed-data";
import { selectCandidateSources } from "@/lib/source-ranking";
import type { RiskSignal, SourceDocument } from "@/lib/types";

function source(id: string, url: string): SourceDocument {
  return {
    id,
    url,
    title: id,
    sourceType: "news",
    fetchedText: "Public evidence about vendor risk.",
    brightDataMethod: "Web Unlocker",
    fetchedAt: "2026-05-20T00:00:00.000Z",
    authorityScore: 85,
    recencyScore: 85,
    directnessScore: 85,
    reliabilityScore: 85,
    evidenceGrade: "Strong",
    evidenceReasoning: "Strong evidence for test."
  };
}

function signal(id: string, category: RiskSignal["category"], sourceUrl: string): RiskSignal {
  return {
    id,
    category,
    severity: 7,
    summary: `${category} finding`,
    sourceUrl,
    evidenceSnippet: "Evidence snippet",
    sourceAuthority: 85,
    recency: 85,
    corroborationCount: 2,
    confidence: 85
  };
}

describe("bounded agent controls", () => {
  it("stops when evidence is strong enough and category coverage is broad enough", () => {
    const sources = [
      source("src_1", "https://example.com/1"),
      source("src_2", "https://example.com/2"),
      source("src_3", "https://example.com/3")
    ];
    const signals = [
      signal("sig_1", "Security", sources[0].url),
      signal("sig_2", "Regulatory", sources[1].url)
    ];

    expect(hasSufficientEvidence(sources, signals, 78)).toBe(true);
  });

  it("does not stop as sufficient when evidence has only one risk category", () => {
    const sources = [
      source("src_1", "https://example.com/1"),
      source("src_2", "https://example.com/2"),
      source("src_3", "https://example.com/3")
    ];
    const signals = [
      signal("sig_1", "Security", sources[0].url),
      signal("sig_2", "Security", sources[1].url)
    ];

    expect(hasSufficientEvidence(sources, signals, 82)).toBe(false);
  });

  it("detects strict budget exhaustion", () => {
    const budgetUsed = {
      ...emptyBudgetUsage(),
      iterations: AGENT_BUDGET.maxIterations
    };

    expect(isBudgetExhausted(budgetUsed)).toBe(true);
    expect(stopDetail("budget_exhausted", budgetUsed, 50)).toContain(`${AGENT_BUDGET.maxIterations}`);
  });

  it("marks seeded investigations as non-live demo cache", () => {
    const investigation = createSeededInvestigation({
      vendorName: "Acme CloudWorks",
      domain: "acmecloudworks.example"
    });

    expect(investigation.mode).toBe("seeded");
    expect(investigation.liveDataUsed).toBe(false);
    expect(investigation.toolUsage.seededCache).toBeGreaterThan(0);
    expect(investigation.stopReason).toBeTruthy();
  });

  it("treats timeout and budget exhaustion as partial terminal completions", () => {
    expect(completionTypeForStopReason("timeout")).toBe("partial");
    expect(completionTypeForStopReason("budget_exhausted")).toBe("partial");
    expect(completionTypeForStopReason("sufficient_evidence")).toBe("full");
    expect(completionTypeForStopReason("tool_error_fallback")).toBe("fallback");
  });

  it("ranks authoritative and vendor-relevant candidates before low-value sources", () => {
    const selection = selectCandidateSources(
      [],
      [
        {
          url: "https://social.example.com/vendor-login",
          title: "Vendor login",
          sourceType: "unknown",
          discoveryMethod: "SERP API"
        },
        {
          url: "https://vendor.com/security/trust-center",
          title: "Vendor SOC 2 trust center security",
          sourceType: "official",
          discoveryMethod: "SERP API"
        },
        {
          url: "https://ftc.gov/vendor-regulatory-investigation",
          title: "Regulatory investigation notice",
          sourceType: "regulatory",
          discoveryMethod: "SERP API"
        }
      ],
      {
        vendorName: "Vendor",
        domain: "vendor.com",
        riskFocus: "security compliance"
      },
      [],
      2
    );

    expect(selection.selected.map(({ candidate }) => candidate.url)).toContain("https://vendor.com/security/trust-center");
    expect(selection.selected[0].reason).toContain("risk keyword");
    expect(selection.skipped.some(({ candidate }) => candidate.url.includes("vendor-login"))).toBe(true);
  });
});
