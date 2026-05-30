import { generateObject } from "ai";
import { z } from "zod";
import { AGENT_BUDGET, emptyBudgetUsage, emptyToolUsage, traceEntry } from "@/lib/agent-metadata";
import { fetchWithBrowserFallback, fetchWithUnlocker, liveAgentReady, searchSerp } from "@/lib/brightdata";
import { extractSignals, generateRiskMemo } from "@/lib/openai-agent";
import { llmModel } from "@/lib/llm-provider";
import { aggregateEvidenceQuality, buildFallbackReport, enrichSignalEvidence } from "@/lib/scoring";
import { selectCandidateSources } from "@/lib/source-ranking";
import type {
  AgentBudgetUsage,
  AgentTrace,
  CandidateUrl,
  CompletionType,
  Investigation,
  InvestigationInput,
  RiskSignal,
  SelectedSource,
  SourceDocument,
  StopReason,
  ToolUsage
} from "@/lib/types";
import { dedupeCandidateUrls, normalizeDomain, normalizeUrl } from "@/lib/utils";

const decisionSchema = z.object({
  action: z.enum(["searchWeb", "fetchPage", "finishInvestigation"]),
  rationale: z.string().min(12),
  queries: z.array(z.string()).max(2).default([]),
  urls: z.array(z.string()).max(3).default([])
});

export interface AgentRunResult {
  sources: SourceDocument[];
  signals: RiskSignal[];
  report: Investigation["report"];
  trace: AgentTrace[];
  searchQueries: string[];
  stopReason: StopReason;
  stopReasonDetail: string;
  toolUsage: ToolUsage;
  budgetUsed: AgentBudgetUsage;
  liveDataUsed: boolean;
  completionType: CompletionType;
  selectedSources: SelectedSource[];
}

export type AgentProgressPatch = Partial<
  Pick<
    Investigation,
    | "currentStep"
    | "statusMessage"
    | "agentTrace"
    | "searchQueries"
    | "toolUsage"
    | "budgetUsed"
    | "sources"
    | "signals"
    | "report"
    | "stopReason"
    | "stopReasonDetail"
    | "liveDataUsed"
    | "completionType"
    | "selectedSources"
  >
>;

export type AgentProgressCallback = (patch: AgentProgressPatch) => void | Promise<void>;

export function hasSufficientEvidence(sources: SourceDocument[], signals: RiskSignal[], evidenceQuality: number) {
  const categories = new Set(signals.map((signal) => signal.category));
  return evidenceQuality >= 70 && sources.length >= 3 && categories.size >= 2;
}

export function isBudgetExhausted(budgetUsed: AgentBudgetUsage) {
  return (
    budgetUsed.iterations >= AGENT_BUDGET.maxIterations ||
    budgetUsed.searches >= AGENT_BUDGET.maxSearches ||
    budgetUsed.fetches >= AGENT_BUDGET.maxFetches
  );
}

export function stopDetail(reason: StopReason, budgetUsed: AgentBudgetUsage, evidenceQuality: number) {
  switch (reason) {
    case "sufficient_evidence":
      return `Stopped because evidence quality reached ${evidenceQuality}/100 with enough relevant sources and risk-category coverage.`;
    case "budget_exhausted":
      return `Stopped because the bounded agent used ${budgetUsed.iterations}/${AGENT_BUDGET.maxIterations} iterations, ${budgetUsed.searches}/${AGENT_BUDGET.maxSearches} searches, or ${budgetUsed.fetches}/${AGENT_BUDGET.maxFetches} fetches.`;
    case "timeout":
      return `Stopped because the run reached the ${Math.round(AGENT_BUDGET.maxRuntimeMs / 1000)} second runtime budget.`;
    case "no_more_relevant_sources":
      return "Stopped because the agent did not identify more relevant sources worth fetching within the current evidence set.";
    case "missing_live_credentials":
      return "Stopped before live mode because OpenRouter and Bright Data credentials are required for the autonomous agent.";
    case "tool_error_fallback":
      return "Stopped because live tools failed to produce usable evidence; the app returned the best fallback report.";
  }
}

export function completionTypeForStopReason(reason: StopReason): CompletionType {
  if (reason === "sufficient_evidence") return "full";
  if (reason === "missing_live_credentials" || reason === "tool_error_fallback") return "fallback";
  return "partial";
}

class AgentTimeoutError extends Error {
  constructor() {
    super("timeout");
  }
}

export async function runBoundedAgent(
  input: InvestigationInput,
  onProgress?: AgentProgressCallback
): Promise<AgentRunResult> {
  if (!liveAgentReady()) {
    throw new Error("missing_live_credentials");
  }

  const startedAt = Date.now();
  const toolUsage = emptyToolUsage();
  const budgetUsed = emptyBudgetUsage();
  const trace: AgentTrace[] = [];
  const searchQueries: string[] = [];
  let selectedSources: SelectedSource[] = [];
  let candidates: CandidateUrl[] = [];
  const sources: SourceDocument[] = [];
  let signals: RiskSignal[] = [];
  let stopReason: StopReason | null = null;
  let stopReasonDetail = "";

  trace.push(
    traceEntry({
      action: "plan",
      rationale: "Start a bounded autonomous investigation with strict search, fetch, iteration, and runtime caps.",
      tool: "LLM",
      inputSummary: `${input.vendorName} (${input.domain || "domain unknown"})`,
      resultSummary: `${AGENT_BUDGET.maxIterations} iterations, ${AGENT_BUDGET.maxSearches} searches, ${AGENT_BUDGET.maxFetches} fetches, ${AGENT_BUDGET.maxRuntimeMs / 1000}s runtime.`,
      evidenceQualityBefore: 0,
      evidenceQualityAfter: 0,
      confidenceReasoning: "The agent will only mark full completion when evidence quality, source count, and category coverage pass the sufficient-evidence gate."
    })
  );
  await emitProgress(onProgress, {
    currentStep: "planning",
    statusMessage: "Planning a bounded vendor-risk investigation.",
    agentTrace: [...trace],
    budgetUsed: { ...budgetUsed },
    toolUsage: { ...toolUsage },
    liveDataUsed: false
  });

  while (!stopReason) {
    const runtimeMs = Date.now() - startedAt;
    budgetUsed.runtimeMs = runtimeMs;
    budgetUsed.finalSources = sources.length;
    const evidenceBefore = aggregateEvidenceQuality(sources, signals);

    if (hasSufficientEvidence(sources, signals, evidenceBefore)) {
      stopReason = "sufficient_evidence";
      stopReasonDetail = stopDetail(stopReason, budgetUsed, evidenceBefore);
      break;
    }

    if (isTimedOut(startedAt)) {
      stopReason = "timeout";
      stopReasonDetail = stopDetail(stopReason, budgetUsed, evidenceBefore);
      break;
    }

    if (isBudgetExhausted(budgetUsed)) {
      stopReason = "budget_exhausted";
      stopReasonDetail = stopDetail(stopReason, budgetUsed, evidenceBefore);
      break;
    }

    budgetUsed.iterations += 1;
    let decision: Awaited<ReturnType<typeof chooseNextAction>>;
    try {
      decision = await withDeadline(
        chooseNextAction(input, candidates, sources, signals, budgetUsed, evidenceBefore, searchQueries),
        remainingMs(startedAt)
      );
    } catch (error) {
      if (error instanceof AgentTimeoutError) {
        stopReason = "timeout";
        stopReasonDetail = stopDetail(stopReason, budgetUsed, evidenceBefore);
        break;
      }
      throw error;
    }
    toolUsage.openai += 1;
    trace.push(
      traceEntry({
        action: decision.action,
        rationale: decision.rationale,
        tool: "LLM",
        inputSummary: `${sources.length} sources, ${candidates.length} candidates, ${signals.length} signals.`,
        resultSummary:
          decision.action === "searchWeb"
            ? `Search requested: ${decision.queries.join("; ")}`
            : decision.action === "fetchPage"
              ? `Fetch requested: ${decision.urls.join("; ") || "best remaining candidates"}`
              : "Agent requested finish.",
        evidenceQualityBefore: evidenceBefore,
        evidenceQualityAfter: evidenceBefore,
        whatChanged: "Agent selected the next bounded action from current candidates, sources, signals, and remaining budget.",
        confidenceReasoning: `${sources.length} fetched sources, ${signals.length} signals, evidence quality ${evidenceBefore}/100.`
      })
    );
    await emitProgress(onProgress, {
      currentStep: decision.action === "searchWeb" ? "searching" : decision.action === "fetchPage" ? "fetching" : "scoring",
      statusMessage:
        decision.action === "searchWeb"
          ? "Agent chose the next public-web searches."
          : decision.action === "fetchPage"
            ? "Agent chose source pages to fetch."
            : "Agent decided to finish with the available evidence.",
      agentTrace: [...trace],
      budgetUsed: { ...budgetUsed },
      toolUsage: { ...toolUsage }
    });

    if (decision.action === "finishInvestigation") {
      stopReason = hasSufficientEvidence(sources, signals, evidenceBefore)
        ? "sufficient_evidence"
        : "no_more_relevant_sources";
      stopReasonDetail = stopDetail(stopReason, budgetUsed, evidenceBefore);
      break;
    }

    if (decision.action === "searchWeb") {
      const queries = decision.queries.length > 0 ? decision.queries : defaultQueries(input).slice(0, 2);
      for (const query of queries) {
        if (isTimedOut(startedAt)) {
          stopReason = "timeout";
          stopReasonDetail = stopDetail(stopReason, budgetUsed, beforeQuality(sources, signals));
          break;
        }
        if (budgetUsed.searches >= AGENT_BUDGET.maxSearches) break;
        const before = aggregateEvidenceQuality(sources, signals);
        const results = await searchSerp(query, 5, boundedTimeout(startedAt, 15_000));
        budgetUsed.searches += 1;
        toolUsage.serp += 1;
        searchQueries.push(query);
        candidates = dedupeCandidateUrls([...candidates, ...results]).slice(0, 18);
        trace.push(
          traceEntry({
            action: "searchWeb",
            rationale: "Use Bright Data SERP API to discover public evidence candidates.",
            tool: "SERP API",
            inputSummary: query,
            resultSummary: `${results.length} candidates returned, ${candidates.length} total unique candidates retained.`,
            evidenceQualityBefore: before,
            evidenceQualityAfter: aggregateEvidenceQuality(sources, signals),
            whySelected: results.slice(0, 3).map((result) => `${result.title}: discovered as ${result.sourceType} evidence candidate.`),
            whatChanged: `${results.length} new SERP candidates were merged into the ranked fetch pool.`
          })
        );
        await emitProgress(onProgress, {
          currentStep: "searching",
          statusMessage: `Searched public web for: ${query}`,
          agentTrace: [...trace],
          searchQueries: [...searchQueries],
          budgetUsed: { ...budgetUsed },
          toolUsage: { ...toolUsage }
        });
      }
    }

    if (stopReason) continue;

    if (decision.action === "fetchPage") {
      const selection = selectCandidateSources(decision.urls, candidates, input, sources);
      selectedSources = mergeSelectedSources(selectedSources, selection.selectedSources);
      if (selection.selected.length === 0) {
        stopReason = "no_more_relevant_sources";
        stopReasonDetail = stopDetail(stopReason, budgetUsed, evidenceBefore);
        break;
      }
      trace.push(
        traceEntry({
          action: "assessEvidence",
          rationale: "Rank candidate sources before spending fetch budget.",
          tool: "Scoring",
          inputSummary: `${candidates.length} available candidates`,
          resultSummary: `${selection.selected.length} selected for fetch, ${selection.skipped.length} lower-priority candidates skipped.`,
          evidenceQualityBefore: evidenceBefore,
          evidenceQualityAfter: evidenceBefore,
          whySelected: selection.selected.map(({ candidate, reason }) => `${candidate.url} - ${reason}`),
          whySkipped: selection.skipped.map(({ candidate, reason }) => `${candidate.url} - ${reason}`),
          whatChanged: "The fetch queue is now ranked by authority, vendor relevance, risk keywords, and focus-term match."
        })
      );
      await emitProgress(onProgress, {
        currentStep: "assessing",
        statusMessage: "Ranked candidate sources before fetching.",
        agentTrace: [...trace],
        selectedSources: [...selectedSources],
        budgetUsed: { ...budgetUsed },
        toolUsage: { ...toolUsage }
      });

      for (const { candidate, reason } of selection.selected) {
        if (isTimedOut(startedAt)) {
          stopReason = "timeout";
          stopReasonDetail = stopDetail(stopReason, budgetUsed, beforeQuality(sources, signals));
          break;
        }
        if (budgetUsed.fetches >= AGENT_BUDGET.maxFetches || sources.length >= AGENT_BUDGET.maxFinalSources) break;
        const before = aggregateEvidenceQuality(sources, signals);
        toolUsage.webUnlocker += 1;
        budgetUsed.fetches += 1;
        let source = await fetchWithUnlocker(candidate, input.domain, boundedTimeout(startedAt, 18_000));
        let tool: "Web Unlocker" | "Browser Zone Fallback" = "Web Unlocker";

        if (!source) {
          toolUsage.browserApi += 1;
          source = await fetchWithBrowserFallback(candidate, input.domain, boundedTimeout(startedAt, 18_000));
          tool = "Browser Zone Fallback";
        }

        if (source) {
          sources.push(source);
          selectedSources = updateSelectedSource(selectedSources, candidate.url, {
            status: "fetched",
            fetchMethod: source.brightDataMethod,
            evidenceGrade: source.evidenceGrade,
            evidenceReasoning: source.evidenceReasoning
          });
        } else {
          selectedSources = updateSelectedSource(selectedSources, candidate.url, {
            status: "failed",
            fetchMethod: tool
          });
        }

        trace.push(
          traceEntry({
            action: "fetchPage",
            rationale:
              tool === "Web Unlocker"
                ? "Fetch public page content with Bright Data Web Unlocker."
                : "Retry through the configured Bright Data browser-zone fallback via REST request; this is not a full browser automation session.",
            tool,
            inputSummary: candidate.url,
            resultSummary: source ? `Fetched ${source.fetchedText.length} text characters.` : "No usable content returned.",
            evidenceQualityBefore: before,
            evidenceQualityAfter: aggregateEvidenceQuality(sources, signals),
            whySelected: [reason],
            whatChanged: source
              ? `Source added with ${source.evidenceGrade} evidence: ${source.evidenceReasoning}`
              : "Candidate marked failed; no source evidence was added.",
            confidenceReasoning: source
              ? `Authority ${source.authorityScore}, recency ${source.recencyScore}, directness ${source.directnessScore}, reliability ${source.reliabilityScore}.`
              : "Confidence did not improve because retrieval returned no usable text."
          })
        );
        await emitProgress(onProgress, {
          currentStep: "fetching",
          statusMessage: source
            ? `Fetched evidence from ${candidate.url}`
            : `No usable evidence returned from ${candidate.url}`,
          agentTrace: [...trace],
          sources: [...sources],
          selectedSources: [...selectedSources],
          budgetUsed: { ...budgetUsed },
          toolUsage: { ...toolUsage }
        });
      }
    }

    if (stopReason) continue;

    if (sources.length > 0) {
      await emitProgress(onProgress, {
        currentStep: "extracting",
        statusMessage: "Extracting structured risk signals from fetched evidence.",
        sources: [...sources],
        budgetUsed: { ...budgetUsed },
        toolUsage: { ...toolUsage }
      });
      const before = aggregateEvidenceQuality(sources, signals);
      signals = (await extractSignals(input, sources)).map((signal) => enrichSignalEvidence(signal, sources));
      toolUsage.openai += 1;
      trace.push(
        traceEntry({
          action: "extractSignals",
          rationale: "Convert fetched public-source evidence into structured vendor-risk signals.",
          tool: "LLM",
          inputSummary: `${sources.length} fetched sources`,
          resultSummary: `${signals.length} risk signals extracted.`,
          evidenceQualityBefore: before,
          evidenceQualityAfter: aggregateEvidenceQuality(sources, signals),
          whatChanged: `${new Set(signals.map((signal) => signal.category)).size} risk categories are now represented.`,
          confidenceReasoning: signals.length > 0
            ? `Average extraction confidence ${Math.round(signals.reduce((sum, signal) => sum + signal.confidence, 0) / signals.length)}/100.`
            : "No structured signals were extracted from the fetched text."
        })
      );
      await emitProgress(onProgress, {
        currentStep: "assessing",
        statusMessage: `${signals.length} risk signals extracted; reassessing evidence quality.`,
        agentTrace: [...trace],
        sources: [...sources],
        signals: [...signals],
        selectedSources: [...selectedSources],
        budgetUsed: { ...budgetUsed },
        toolUsage: { ...toolUsage }
      });
    }
  }

  if (sources.length === 0) {
    if (stopReason === "timeout") throw new Error("timeout");
    throw new Error("tool_error_fallback");
  }

  const finalSources = sources.slice(0, AGENT_BUDGET.maxFinalSources);
  const baseReport = buildFallbackReport(input.vendorName, signals, finalSources);
  await emitProgress(onProgress, {
    currentStep: "scoring",
    statusMessage: "Generating final risk score and procurement memo.",
    sources: [...finalSources],
    signals: [...signals],
    selectedSources: [...selectedSources],
    budgetUsed: { ...budgetUsed },
    toolUsage: { ...toolUsage }
  });
  let report = baseReport;
  if (!isTimedOut(startedAt)) {
    toolUsage.openai += 1;
    report = await withDeadline(
      generateRiskMemo(input, finalSources, signals, baseReport),
      boundedTimeout(startedAt, 12_000)
    ).catch((error) => {
      if (error instanceof AgentTimeoutError) {
        stopReason = "timeout";
        stopReasonDetail = stopDetail(stopReason, budgetUsed, aggregateEvidenceQuality(finalSources, signals));
        return baseReport;
      }
      return baseReport;
    });
  } else {
    stopReason = "timeout";
    stopReasonDetail = stopDetail(stopReason, budgetUsed, aggregateEvidenceQuality(finalSources, signals));
  }
  const finalEvidenceQuality = report.evidenceQuality;
  budgetUsed.runtimeMs = Date.now() - startedAt;
  budgetUsed.finalSources = finalSources.length;

  if (!stopReason) {
    stopReason = hasSufficientEvidence(finalSources, signals, finalEvidenceQuality)
      ? "sufficient_evidence"
      : "budget_exhausted";
    stopReasonDetail = stopDetail(stopReason, budgetUsed, finalEvidenceQuality);
  }
  if (!stopReasonDetail) {
    stopReasonDetail = stopDetail(stopReason, budgetUsed, finalEvidenceQuality);
  }
  const completionType = completionTypeForStopReason(stopReason);

  trace.push(
    traceEntry({
      action: "finishInvestigation",
      rationale: stopReasonDetail,
      tool: "Scoring",
      inputSummary: `${finalSources.length} final sources and ${signals.length} risk signals`,
      resultSummary: `${report.rating} risk, ${report.confidence}/100 confidence, ${report.evidenceQuality}/100 evidence quality.`,
      evidenceQualityBefore: finalEvidenceQuality,
      evidenceQualityAfter: finalEvidenceQuality,
      whatChanged: `${completionType === "full" ? "Full" : "Partial"} terminal report generated.`,
      confidenceReasoning: `Stopped with ${finalSources.length} final sources, ${signals.length} signals, and ${report.confidence}/100 report confidence.`
    })
  );
  await emitProgress(onProgress, {
    currentStep: "complete",
    statusMessage: "Investigation complete.",
    agentTrace: [...trace],
    searchQueries: [...searchQueries],
    sources: [...finalSources],
    signals: [...signals],
    report,
    stopReason,
    stopReasonDetail,
    completionType,
    selectedSources: [...selectedSources],
    toolUsage: { ...toolUsage },
    budgetUsed: { ...budgetUsed },
    liveDataUsed: true
  });

  return {
    sources: finalSources,
    signals,
    report,
    trace,
    searchQueries,
    stopReason,
    stopReasonDetail,
    toolUsage,
    budgetUsed,
    liveDataUsed: true,
    completionType,
    selectedSources
  };
}

async function emitProgress(onProgress: AgentProgressCallback | undefined, patch: AgentProgressPatch) {
  if (onProgress) await onProgress(patch);
}

async function chooseNextAction(
  input: InvestigationInput,
  candidates: CandidateUrl[],
  sources: SourceDocument[],
  signals: RiskSignal[],
  budgetUsed: AgentBudgetUsage,
  evidenceQuality: number,
  searchQueries: string[]
) {
  try {
    const { object } = await generateObject({
      model: llmModel(),
      schema: decisionSchema,
      prompt: [
        `You are a bounded autonomous vendor-risk investigator for ${input.vendorName}.`,
        `Domain: ${input.domain || "unknown"}. Risk focus: ${input.riskFocus || "general procurement and compliance risk"}.`,
        "Choose exactly one next action: searchWeb, fetchPage, or finishInvestigation.",
        "Prefer searchWeb when evidence is weak or categories are missing. Prefer fetchPage when relevant candidates exist. Finish only when evidence is good enough or no useful candidates remain.",
        `Budgets used: ${JSON.stringify(budgetUsed)}. Current evidence quality: ${evidenceQuality}/100.`,
        `Previous queries: ${JSON.stringify(searchQueries.slice(-6))}`,
        `Candidates: ${JSON.stringify(candidates.slice(0, 10).map(({ url, title, sourceType }) => ({ url, title, sourceType })))}`,
        `Sources: ${JSON.stringify(sources.map(({ url, title, sourceType, authorityScore, recencyScore }) => ({ url, title, sourceType, authorityScore, recencyScore })))}`,
        `Signals: ${JSON.stringify(signals.map(({ category, severity, summary, confidence }) => ({ category, severity, summary, confidence })))}`
      ].join("\n\n")
    });
    return object;
  } catch {
    if (sources.length >= 3 && evidenceQuality >= 60) {
      return {
        action: "finishInvestigation" as const,
        rationale: "Fallback decision: available evidence is adequate for a bounded report.",
        queries: [],
        urls: []
      };
    }

    const unfetched = selectCandidateSources([], candidates, input, sources).selected.map(({ candidate }) => candidate);
    if (unfetched.length > 0) {
      return {
        action: "fetchPage" as const,
        rationale: "Fallback decision: fetch the strongest remaining candidate URLs.",
        queries: [],
        urls: unfetched.map((candidate) => candidate.url)
      };
    }

    return {
      action: "searchWeb" as const,
      rationale: "Fallback decision: search for more public evidence.",
      queries: defaultQueries(input).filter((query) => !searchQueries.includes(query)).slice(0, 2),
      urls: []
    };
  }
}

function defaultQueries(input: InvestigationInput) {
  const vendor = input.vendorName.trim();
  const domain = normalizeDomain(input.domain);
  const base = domain ? `${vendor} ${domain}` : vendor;
  return [
    `${base} security incident breach compliance`,
    `${base} lawsuit regulatory investigation`,
    `${base} outage status page service disruption`,
    `${base} layoffs financial distress leadership change`,
    `${base} reviews enterprise support risk`,
    `${base} trust center SOC 2 ISO 27001`
  ];
}

function beforeQuality(sources: SourceDocument[], signals: RiskSignal[]) {
  return aggregateEvidenceQuality(sources, signals);
}

function elapsedMs(startedAt: number) {
  return Date.now() - startedAt;
}

function remainingMs(startedAt: number) {
  return Math.max(0, AGENT_BUDGET.maxRuntimeMs - elapsedMs(startedAt));
}

function boundedTimeout(startedAt: number, requestedMs: number) {
  return Math.max(1, Math.min(requestedMs, remainingMs(startedAt)));
}

function isTimedOut(startedAt: number) {
  return remainingMs(startedAt) <= 0;
}

async function withDeadline<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (timeoutMs <= 0) throw new AgentTimeoutError();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new AgentTimeoutError()), timeoutMs);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function mergeSelectedSources(existing: SelectedSource[], incoming: SelectedSource[]) {
  const byUrl = new Map(existing.map((source) => [normalizeUrl(source.url), source]));
  for (const source of incoming) {
    const key = normalizeUrl(source.url);
    if (!byUrl.has(key) || byUrl.get(key)?.status === "skipped") {
      byUrl.set(key, source);
    }
  }
  return Array.from(byUrl.values()).slice(0, 18);
}

function updateSelectedSource(existing: SelectedSource[], url: string, patch: Partial<SelectedSource>) {
  const key = normalizeUrl(url);
  return existing.map((source) =>
    normalizeUrl(source.url) === key ? { ...source, ...patch } : source
  );
}
