export type InvestigationStatus = "queued" | "running" | "complete" | "failed";

export type RunMode = "seeded" | "live-agent" | "live-fallback";

export type CompletionType = "full" | "partial" | "fallback";

export type EvidenceGrade = "Strong" | "Moderate" | "Weak";

export type StopReason =
  | "sufficient_evidence"
  | "budget_exhausted"
  | "timeout"
  | "no_more_relevant_sources"
  | "missing_live_credentials"
  | "tool_error_fallback";

export type AgentAction =
  | "plan"
  | "searchWeb"
  | "fetchPage"
  | "assessEvidence"
  | "extractSignals"
  | "finishInvestigation"
  | "fallback";

export type CurrentStep =
  | "queued"
  | "planning"
  | "searching"
  | "fetching"
  | "assessing"
  | "extracting"
  | "scoring"
  | "complete"
  | "failed";

export type InvestigationStepKey =
  | "discovering"
  | "fetching"
  | "assessing"
  | "extracting"
  | "scoring"
  | "memo";

export type StepStatus = "pending" | "running" | "complete" | "failed";

export type RiskRating = "Low" | "Medium" | "High" | "Critical";

export type RiskSignalCategory =
  | "Security"
  | "Legal"
  | "Regulatory"
  | "Financial"
  | "Operational"
  | "Leadership"
  | "Reputation"
  | "Service";

export type SourceType =
  | "official"
  | "news"
  | "regulatory"
  | "security"
  | "review"
  | "legal"
  | "market"
  | "unknown";

export interface InvestigationInput {
  vendorName: string;
  domain?: string;
  riskFocus?: string;
  forceLive?: boolean;
}

export interface InvestigationStep {
  key: InvestigationStepKey;
  label: string;
  status: StepStatus;
  detail: string;
}

export interface SourceDocument {
  id: string;
  url: string;
  title: string;
  sourceType: SourceType;
  fetchedText: string;
  brightDataMethod: "SERP API" | "Web Unlocker" | "Browser Zone Fallback" | "Seeded Cache";
  fetchedAt: string;
  authorityScore: number;
  recencyScore: number;
  directnessScore: number;
  reliabilityScore: number;
  evidenceGrade: EvidenceGrade;
  evidenceReasoning: string;
}

export interface ToolUsage {
  openai: number;
  serp: number;
  webUnlocker: number;
  browserApi: number;
  seededCache: number;
}

export interface AgentBudget {
  maxIterations: number;
  maxSearches: number;
  maxFetches: number;
  maxRuntimeMs: number;
  maxFinalSources: number;
}

export interface AgentBudgetUsage {
  iterations: number;
  searches: number;
  fetches: number;
  runtimeMs: number;
  finalSources: number;
}

export interface AgentTrace {
  id: string;
  action: AgentAction;
  rationale: string;
  tool: "LLM" | "SERP API" | "Web Unlocker" | "Browser Zone Fallback" | "Scoring" | "Seeded Cache";
  inputSummary: string;
  resultSummary: string;
  evidenceQualityBefore: number;
  evidenceQualityAfter: number;
  timestamp: string;
  whySelected?: string[];
  whySkipped?: string[];
  whatChanged?: string;
  confidenceReasoning?: string;
}

export interface RiskSignal {
  id: string;
  category: RiskSignalCategory;
  severity: number;
  summary: string;
  sourceUrl: string;
  evidenceSnippet: string;
  sourceAuthority: number;
  recency: number;
  corroborationCount: number;
  confidence: number;
  evidenceGrade?: EvidenceGrade;
  evidenceReasoning?: string;
}

export interface RiskReport {
  score: number;
  rating: RiskRating;
  confidence: number;
  evidenceQuality: number;
  whyThisMatters: string;
  actions: string[];
  watchlistTriggers: string[];
}

export interface Investigation {
  id: string;
  input: InvestigationInput;
  version: number;
  currentStep: CurrentStep;
  statusMessage: string;
  completionType: CompletionType;
  mode: RunMode;
  stopReason: StopReason;
  stopReasonDetail: string;
  liveDataUsed: boolean;
  toolUsage: ToolUsage;
  budget: AgentBudget;
  budgetUsed: AgentBudgetUsage;
  agentTrace: AgentTrace[];
  searchQueries: string[];
  selectedSources: SelectedSource[];
  status: InvestigationStatus;
  createdAt: string;
  updatedAt: string;
  steps: InvestigationStep[];
  sources: SourceDocument[];
  signals: RiskSignal[];
  report?: RiskReport;
  error?: string;
}

export interface CandidateUrl {
  url: string;
  title: string;
  sourceType: SourceType;
  discoveryMethod: "SERP API" | "Seeded Cache";
}

export interface SelectedSource {
  id: string;
  url: string;
  title: string;
  sourceType: SourceType;
  selectionReason: string;
  status: "selected" | "fetched" | "skipped" | "failed";
  fetchMethod?: SourceDocument["brightDataMethod"];
  evidenceGrade?: EvidenceGrade;
  evidenceReasoning?: string;
}
