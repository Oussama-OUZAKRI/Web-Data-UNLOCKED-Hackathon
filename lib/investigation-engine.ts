import { runBoundedAgent } from "@/lib/agent-runner";
import { AGENT_BUDGET, emptyBudgetUsage, emptyToolUsage } from "@/lib/agent-metadata";
import { liveAgentReady } from "@/lib/brightdata";
import { createSeededInvestigation } from "@/lib/seed-data";
import { buildFallbackReport } from "@/lib/scoring";
import type { AgentRunResult } from "@/lib/agent-runner";
import type { Investigation, InvestigationInput, InvestigationStep } from "@/lib/types";
import { getInvestigation, patchInvestigation, replaceInvestigation } from "@/lib/store";
import { normalizeDomain, uid } from "@/lib/utils";

const STEP_LABELS: Record<InvestigationStep["key"], string> = {
  discovering: "Discovering",
  fetching: "Fetching",
  assessing: "Assessing Evidence",
  extracting: "Extracting Signals",
  scoring: "Scoring",
  memo: "Generating Memo"
};

export async function runInvestigation(input: InvestigationInput): Promise<Investigation> {
  const normalizedInput = {
    ...input,
    vendorName: input.vendorName.trim(),
    domain: normalizeDomain(input.domain)
  };

  if (!normalizedInput.vendorName) {
    throw new Error("vendorName is required");
  }

  if (!input.forceLive && isDemoVendor(normalizedInput.vendorName)) {
    return createSeededInvestigation(normalizedInput);
  }

  if (!liveAgentReady()) {
    return createSeededInvestigation(normalizedInput);
  }

  const createdAt = new Date().toISOString();
  const investigation: Investigation = {
    id: uid("inv"),
    input: normalizedInput,
    version: 1,
    currentStep: "planning",
    statusMessage: "Starting bounded live-agent investigation.",
    completionType: "partial",
    mode: "live-agent",
    stopReason: "budget_exhausted",
    stopReasonDetail: "Live bounded agent is starting.",
    liveDataUsed: false,
    toolUsage: emptyToolUsage(),
    budget: AGENT_BUDGET,
    budgetUsed: emptyBudgetUsage(),
    agentTrace: [],
    searchQueries: [],
    selectedSources: [],
    status: "running",
    createdAt,
    updatedAt: createdAt,
    steps: baseSteps(),
    sources: [],
    signals: []
  };

  try {
    setStep(investigation, "discovering", "running", "Bounded agent is choosing live web searches.");
    const result = await runBoundedAgent(normalizedInput);
    applyAgentResult(investigation, result);

    investigation.status = "complete";
    investigation.updatedAt = new Date().toISOString();
    return investigation;
  } catch (error) {
    const fallback = createSeededInvestigation(normalizedInput);
    fallback.mode = "live-fallback";
    fallback.completionType = "fallback";
    fallback.stopReason = error instanceof Error && error.message === "missing_live_credentials"
      ? "missing_live_credentials"
      : error instanceof Error && error.message === "timeout"
        ? "timeout"
      : "tool_error_fallback";
    fallback.stopReasonDetail =
      fallback.stopReason === "missing_live_credentials"
        ? "Live mode needs OpenRouter and Bright Data credentials; seeded cache returned instead."
        : fallback.stopReason === "timeout"
          ? "Live mode reached the runtime budget before collecting usable evidence; seeded cache returned instead."
        : "Live tools did not return usable evidence; seeded cache returned so the report remains demoable.";
    return {
      ...fallback,
      input: normalizedInput,
      error: error instanceof Error ? error.message : "Investigation failed; seeded fallback returned."
    };
  }
}

export function createQueuedInvestigation(input: InvestigationInput): Investigation {
  const normalizedInput = {
    ...input,
    vendorName: input.vendorName.trim(),
    domain: normalizeDomain(input.domain)
  };
  const now = new Date().toISOString();

  return {
    id: uid("inv"),
    input: normalizedInput,
    version: 1,
    currentStep: "queued",
    statusMessage: "Investigation queued.",
    completionType: "partial",
    mode: "seeded",
    stopReason: "missing_live_credentials",
    stopReasonDetail: "Investigation has not finished yet.",
    liveDataUsed: false,
    toolUsage: emptyToolUsage(),
    budget: AGENT_BUDGET,
    budgetUsed: emptyBudgetUsage(),
    agentTrace: [],
    searchQueries: [],
    selectedSources: [],
    status: "running",
    createdAt: now,
    updatedAt: now,
    steps: baseSteps(),
    sources: [],
    signals: []
  };
}

export async function runInvestigationIntoStore(id: string, input: InvestigationInput) {
  try {
    patchInvestigation(id, {
      currentStep: "planning",
      statusMessage: "Preparing the investigation run."
    });

    if (!input.forceLive && isDemoVendor(input.vendorName)) {
      const seeded = createSeededInvestigation(input);
      replaceInvestigation(id, {
        ...seeded,
        id,
        completionType: "fallback",
        statusMessage: "Demo cache report is ready."
      });
      return;
    }

    if (!liveAgentReady()) {
      const seeded = createSeededInvestigation(input);
      replaceInvestigation(id, {
        ...seeded,
        id,
        completionType: "fallback",
        mode: input.forceLive ? "live-fallback" : "seeded",
        statusMessage: input.forceLive
          ? "Live credentials are missing; demo cache fallback is ready."
          : "Demo cache report is ready.",
        stopReasonDetail: input.forceLive
          ? "Live mode needs OpenRouter and Bright Data credentials; seeded cache returned instead."
          : seeded.stopReasonDetail
      });
      return;
    }

    const started = patchInvestigation(id, {
      mode: "live-agent",
      currentStep: "planning",
      statusMessage: "Starting bounded live-agent investigation.",
      stopReasonDetail: "Live bounded agent is running."
    });

    if (!started) return;

    const result = await runBoundedAgent(input, async (patch) => {
      patchInvestigation(id, patch);
    });

    const latest = getInvestigation(id);
    if (latest) {
      applyAgentResult(latest, result);
      replaceInvestigation(id, {
        ...latest,
        status: "complete",
        currentStep: "complete",
        statusMessage: "Investigation complete."
      });
    }
  } catch (error) {
    const latest = getInvestigation(id);
    if (latest && latest.sources.length > 0) {
      const stopReason = error instanceof Error && error.message === "timeout" ? "timeout" : "tool_error_fallback";
      const report = latest.report ?? buildFallbackReport(input.vendorName, latest.signals, latest.sources);
      replaceInvestigation(id, {
        ...latest,
        status: "complete",
        currentStep: "complete",
        statusMessage: stopReason === "timeout"
          ? "Live run reached the time limit; partial report is ready."
          : "Live run degraded; partial report is ready.",
        completionType: "partial",
        mode: "live-agent",
        liveDataUsed: true,
        report,
        stopReason,
        stopReasonDetail: stopReason === "timeout"
          ? "Stopped at the hard runtime budget and finalized with the live evidence collected so far."
          : "Live tools failed after collecting usable evidence; finalized with the partial live evidence trail.",
        error: error instanceof Error ? error.message : "Live run degraded."
      });
      return;
    }

    const fallback = createSeededInvestigation(input);
    const liveTrace = latest?.agentTrace ?? [];
    const fallbackTrace = liveTrace.length > 0
      ? [
          ...liveTrace,
          ...fallback.agentTrace.map((trace) => ({
            ...trace,
            rationale: `Fallback after live attempt: ${trace.rationale}`
          }))
        ]
      : fallback.agentTrace;
    const liveSelected = latest?.selectedSources ?? [];
    const fallbackSelected = liveSelected.length > 0
      ? [...liveSelected, ...fallback.selectedSources]
      : fallback.selectedSources;
    const liveToolUsage = latest?.toolUsage;
    const liveBudget = latest?.budgetUsed;
    replaceInvestigation(id, {
      ...fallback,
      id,
      completionType: "fallback",
      mode: "live-fallback",
      currentStep: "complete",
      statusMessage: "Live run failed; fallback report is ready.",
      agentTrace: fallbackTrace,
      selectedSources: fallbackSelected,
      toolUsage: liveToolUsage
        ? {
            openai: liveToolUsage.openai,
            serp: liveToolUsage.serp,
            webUnlocker: liveToolUsage.webUnlocker,
            browserApi: liveToolUsage.browserApi,
            seededCache: fallback.toolUsage.seededCache
          }
        : fallback.toolUsage,
      budgetUsed: liveBudget
        ? {
            ...liveBudget,
            finalSources: fallback.sources.length
          }
        : fallback.budgetUsed,
      stopReason: error instanceof Error && error.message === "missing_live_credentials"
        ? "missing_live_credentials"
        : error instanceof Error && error.message === "timeout"
          ? "timeout"
          : "tool_error_fallback",
      stopReasonDetail:
        error instanceof Error && error.message === "missing_live_credentials"
          ? "Live mode needs OpenRouter and Bright Data credentials; seeded cache returned instead."
          : error instanceof Error && error.message === "timeout"
            ? "Live mode reached the runtime budget before collecting usable evidence; seeded cache returned instead."
          : "Live tools did not return usable evidence; seeded cache returned so the report remains demoable."
    });
  }
}

function baseSteps(): InvestigationStep[] {
  return (Object.keys(STEP_LABELS) as InvestigationStep["key"][]).map((key) => ({
    key,
    label: STEP_LABELS[key],
    status: "pending",
    detail: "Waiting for agent."
  }));
}

function setStep(investigation: Investigation, key: InvestigationStep["key"], status: InvestigationStep["status"], detail: string) {
  investigation.steps = investigation.steps.map((step) =>
    step.key === key ? { ...step, status, detail } : step
  );
  investigation.updatedAt = new Date().toISOString();
}

function isDemoVendor(vendorName: string) {
  const lower = vendorName.toLowerCase();
  return ["acme cloudworks", "northstar payments", "latticebridge logistics", "heliohr"].includes(lower);
}

function applyAgentResult(investigation: Investigation, result: AgentRunResult) {
  investigation.sources = result.sources;
  investigation.signals = result.signals;
  investigation.report = result.report;
  investigation.agentTrace = result.trace;
  investigation.searchQueries = result.searchQueries;
  investigation.selectedSources = result.selectedSources;
  investigation.stopReason = result.stopReason;
  investigation.stopReasonDetail = result.stopReasonDetail;
  investigation.completionType = result.completionType;
  investigation.toolUsage = result.toolUsage;
  investigation.budgetUsed = result.budgetUsed;
  investigation.liveDataUsed = result.liveDataUsed;
  investigation.mode = result.liveDataUsed ? "live-agent" : "live-fallback";

  const report = result.report;
  setStep(investigation, "discovering", "complete", `${result.searchQueries.length} live search queries selected by the agent.`);
  setStep(investigation, "fetching", "complete", `${result.sources.length} pages fetched through Bright Data tools.`);
  setStep(investigation, "assessing", "complete", `Evidence quality reached ${report?.evidenceQuality ?? 0}/100.`);
  setStep(investigation, "extracting", "complete", `${result.signals.length} risk signals extracted.`);
  setStep(investigation, "scoring", "complete", `${report?.rating ?? "Unknown"} risk with ${report?.confidence ?? 0}/100 confidence.`);
  setStep(investigation, "memo", "complete", result.stopReasonDetail);
}
