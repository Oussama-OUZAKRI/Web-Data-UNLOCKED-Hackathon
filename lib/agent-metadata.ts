import type { AgentBudget, AgentBudgetUsage, AgentTrace, ToolUsage } from "@/lib/types";
import { uid } from "@/lib/utils";

export const AGENT_BUDGET: AgentBudget = {
  maxIterations: 4,
  maxSearches: 6,
  maxFetches: 12,
  maxRuntimeMs: 90_000,
  maxFinalSources: 8
};

export function emptyToolUsage(): ToolUsage {
  return {
    openai: 0,
    serp: 0,
    webUnlocker: 0,
    browserApi: 0,
    seededCache: 0
  };
}

export function emptyBudgetUsage(): AgentBudgetUsage {
  return {
    iterations: 0,
    searches: 0,
    fetches: 0,
    runtimeMs: 0,
    finalSources: 0
  };
}

export function traceEntry(input: Omit<AgentTrace, "id" | "timestamp">): AgentTrace {
  return {
    id: uid("trace"),
    timestamp: new Date().toISOString(),
    ...input
  };
}
