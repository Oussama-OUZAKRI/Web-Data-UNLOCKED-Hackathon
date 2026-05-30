import type { Investigation, InvestigationInput, RiskSignal, SourceDocument } from "@/lib/types";
import { AGENT_BUDGET, emptyBudgetUsage, emptyToolUsage, traceEntry } from "@/lib/agent-metadata";
import { buildFallbackReport, enrichSignalEvidence, enrichSourceEvidence } from "@/lib/scoring";
import { uid } from "@/lib/utils";

export const DEMO_VENDORS = [
  {
    vendorName: "Acme CloudWorks",
    domain: "acmecloudworks.example",
    riskFocus: "Security and procurement readiness"
  },
  {
    vendorName: "Northstar Payments",
    domain: "northstarpayments.example",
    riskFocus: "Regulatory and service continuity"
  },
  {
    vendorName: "LatticeBridge Logistics",
    domain: "latticebridge.example",
    riskFocus: "Supply-chain resilience"
  },
  {
    vendorName: "HelioHR",
    domain: "heliohr.example",
    riskFocus: "Compliance and data processing"
  }
];

export function seededSources(input: InvestigationInput): SourceDocument[] {
  const now = new Date().toISOString();
  const vendor = input.vendorName || "Selected vendor";
  const domain = input.domain || `${vendor.toLowerCase().replace(/[^a-z0-9]+/g, "")}.example`;

  const sources: SourceDocument[] = [
    {
      id: uid("src"),
      url: `https://${domain}/security`,
      title: `${vendor} security and trust center`,
      sourceType: "official",
      fetchedText:
        "The vendor publishes security controls, subprocessor details, and uptime commitments. The latest compliance report date is more than nine months old and the trust page asks prospects to request current attestations through sales.",
      brightDataMethod: "Seeded Cache",
      fetchedAt: now,
      authorityScore: 88,
      recencyScore: 62,
      directnessScore: 92,
      reliabilityScore: 90,
      evidenceGrade: "Moderate",
      evidenceReasoning: "Evidence grade pending source scoring."
    },
    {
      id: uid("src"),
      url: `https://news.example.com/${domain}/service-disruption`,
      title: `${vendor} customers report regional service disruption`,
      sourceType: "news",
      fetchedText:
        "Recent customer reports describe a regional service disruption and delayed incident communication. The article cites two customers and links to the vendor status page.",
      brightDataMethod: "Seeded Cache",
      fetchedAt: now,
      authorityScore: 76,
      recencyScore: 84,
      directnessScore: 78,
      reliabilityScore: 74,
      evidenceGrade: "Moderate",
      evidenceReasoning: "Evidence grade pending source scoring."
    },
    {
      id: uid("src"),
      url: `https://regulator.example.gov/notices/${domain}`,
      title: `Regulatory notice mentioning ${vendor}`,
      sourceType: "regulatory",
      fetchedText:
        "A public notice references the vendor as a service provider in an inquiry about data retention and customer notification practices. The notice does not allege a final violation.",
      brightDataMethod: "Seeded Cache",
      fetchedAt: now,
      authorityScore: 94,
      recencyScore: 72,
      directnessScore: 69,
      reliabilityScore: 91,
      evidenceGrade: "Moderate",
      evidenceReasoning: "Evidence grade pending source scoring."
    },
    {
      id: uid("src"),
      url: `https://reviews.example.com/products/${domain}`,
      title: `${vendor} enterprise reviews`,
      sourceType: "review",
      fetchedText:
        "Several enterprise users praise onboarding speed but mention inconsistent support response times and uncertainty about roadmap commitments after a leadership transition.",
      brightDataMethod: "Seeded Cache",
      fetchedAt: now,
      authorityScore: 58,
      recencyScore: 79,
      directnessScore: 66,
      reliabilityScore: 61,
      evidenceGrade: "Moderate",
      evidenceReasoning: "Evidence grade pending source scoring."
    }
  ];

  return sources.map(enrichSourceEvidence);
}

export function seededSignals(sources: SourceDocument[]): RiskSignal[] {
  const sourceByType = new Map(sources.map((source) => [source.sourceType, source]));
  const official = sourceByType.get("official") ?? sources[0];
  const news = sourceByType.get("news") ?? sources[0];
  const regulatory = sourceByType.get("regulatory") ?? sources[0];
  const review = sourceByType.get("review") ?? sources[0];

  const signals: RiskSignal[] = [
    {
      id: uid("sig"),
      category: "Regulatory",
      severity: 7,
      summary: "Public regulatory notice references the vendor in a data-retention inquiry.",
      sourceUrl: regulatory.url,
      evidenceSnippet: "The notice references the vendor as a service provider in an inquiry about data retention.",
      sourceAuthority: regulatory.authorityScore,
      recency: regulatory.recencyScore,
      corroborationCount: 1,
      confidence: 72
    },
    {
      id: uid("sig"),
      category: "Service",
      severity: 6,
      summary: "Recent service disruption reports suggest potential continuity risk.",
      sourceUrl: news.url,
      evidenceSnippet: "Recent customer reports describe a regional service disruption and delayed incident communication.",
      sourceAuthority: news.authorityScore,
      recency: news.recencyScore,
      corroborationCount: 2,
      confidence: 76
    },
    {
      id: uid("sig"),
      category: "Security",
      severity: 5,
      summary: "Trust center exists, but current attestations may require manual request.",
      sourceUrl: official.url,
      evidenceSnippet: "The latest compliance report date is more than nine months old.",
      sourceAuthority: official.authorityScore,
      recency: official.recencyScore,
      corroborationCount: 1,
      confidence: 70
    },
    {
      id: uid("sig"),
      category: "Operational",
      severity: 4,
      summary: "Customer reviews mention support response inconsistency.",
      sourceUrl: review.url,
      evidenceSnippet: "Enterprise users mention inconsistent support response times.",
      sourceAuthority: review.authorityScore,
      recency: review.recencyScore,
      corroborationCount: 2,
      confidence: 62
    }
  ];

  return signals.map((signal) => enrichSignalEvidence(signal, sources));
}

export function createSeededInvestigation(input: InvestigationInput): Investigation {
  const sources = seededSources(input);
  const signals = seededSignals(sources);
  const report = buildFallbackReport(input.vendorName, signals, sources);
  const now = new Date().toISOString();

  return {
    id: uid("inv"),
    input,
    version: 1,
    currentStep: "complete",
    statusMessage: "Demo cache report is ready.",
    completionType: "fallback",
    mode: "seeded",
    stopReason: "missing_live_credentials",
    stopReasonDetail:
      "Demo cache mode was used for a predictable non-live run. Use Refresh live data with OpenRouter and Bright Data credentials for the bounded autonomous agent.",
    liveDataUsed: false,
    toolUsage: {
      ...emptyToolUsage(),
      seededCache: sources.length
    },
    budget: AGENT_BUDGET,
    budgetUsed: {
      ...emptyBudgetUsage(),
      finalSources: sources.length
    },
    agentTrace: [
      traceEntry({
        action: "fallback",
        rationale: "Use seeded cache so the product remains demoable without live credentials.",
        tool: "Seeded Cache",
        inputSummary: `${input.vendorName} (${input.domain ?? "no domain"})`,
        resultSummary: `${sources.length} seeded sources and ${signals.length} seeded signals loaded.`,
        evidenceQualityBefore: 0,
        evidenceQualityAfter: report.evidenceQuality
      }),
      traceEntry({
        action: "finishInvestigation",
        rationale: "Seeded evidence is sufficient for a non-live rehearsal run.",
        tool: "Scoring",
        inputSummary: "Seeded evidence and signals",
        resultSummary: `${report.rating} risk, ${report.confidence}/100 confidence, ${report.evidenceQuality}/100 evidence quality.`,
        evidenceQualityBefore: report.evidenceQuality,
        evidenceQualityAfter: report.evidenceQuality
      })
    ],
    searchQueries: [],
    selectedSources: sources.map((source) => ({
      id: uid("sel"),
      url: source.url,
      title: source.title,
      sourceType: source.sourceType,
      selectionReason: "Loaded from seeded demo cache for predictable rehearsal.",
      status: "fetched",
      fetchMethod: "Seeded Cache",
      evidenceGrade: source.evidenceGrade,
      evidenceReasoning: source.evidenceReasoning
    })),
    status: "complete",
    createdAt: now,
    updatedAt: now,
    steps: [
      {
        key: "discovering",
        label: "Discovering",
        status: "complete",
        detail: "Seeded web discovery loaded for a reliable hackathon demo."
      },
      {
        key: "fetching",
        label: "Fetching",
        status: "complete",
        detail: "Cached source documents replayed with Bright Data method labels."
      },
      {
        key: "assessing",
        label: "Assessing Evidence",
        status: "complete",
        detail: `Evidence quality scored at ${report.evidenceQuality}/100.`
      },
      {
        key: "extracting",
        label: "Extracting Signals",
        status: "complete",
        detail: `${signals.length} risk signals extracted from public-source evidence.`
      },
      {
        key: "scoring",
        label: "Scoring",
        status: "complete",
        detail: `${report.rating} risk with ${report.confidence}/100 confidence.`
      },
      {
        key: "memo",
        label: "Generating Memo",
        status: "complete",
        detail: "Procurement/compliance memo generated."
      }
    ],
    sources,
    signals,
    report
  };
}
