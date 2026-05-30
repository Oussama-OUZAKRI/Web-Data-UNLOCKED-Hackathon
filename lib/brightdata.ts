import type { CandidateUrl, InvestigationInput, SourceDocument } from "@/lib/types";
import { hasLlmConfig } from "@/lib/llm-provider";
import { enrichSourceEvidence } from "@/lib/scoring";
import { compactText, inferSourceAuthority, normalizeDomain, sourceTypeForUrl, uid } from "@/lib/utils";

const REQUEST_ENDPOINT = "https://api.brightdata.com/request";
const SERP_TIMEOUT_MS = 15_000;
const FETCH_TIMEOUT_MS = 18_000;
export const BROWSER_ZONE_FALLBACK_METHOD = "Browser Zone Fallback";

interface SerpResult {
  link?: string;
  url?: string;
  title?: string;
}

function brightDataHeaders() {
  const token = process.env.BRIGHTDATA_API_KEY;
  if (!token) throw new Error("BRIGHTDATA_API_KEY is not configured");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };
}

function hasBrightDataConfig() {
  return Boolean(process.env.BRIGHTDATA_API_KEY && process.env.BRIGHTDATA_SERP_ZONE && process.env.BRIGHTDATA_UNLOCKER_ZONE);
}

export function brightDataReady() {
  return hasBrightDataConfig();
}

export function liveAgentReady() {
  return Boolean(hasLlmConfig() && hasBrightDataConfig());
}

export function buildSearchQueries(input: InvestigationInput) {
  const vendor = input.vendorName.trim();
  const domain = normalizeDomain(input.domain);
  const base = domain ? `${vendor} ${domain}` : vendor;

  return [
    `${base} security incident breach`,
    `${base} lawsuit regulatory investigation`,
    `${base} layoffs financial distress`,
    `${base} status page outage`,
    `${base} reviews enterprise support`,
    `${base} leadership change compliance`
  ];
}

export async function discoverWithSerp(input: InvestigationInput): Promise<CandidateUrl[]> {
  const candidates: CandidateUrl[] = [];

  for (const query of buildSearchQueries(input)) {
    candidates.push(...(await searchSerp(query, 4)));
  }

  return candidates;
}

export async function searchSerp(query: string, limit = 6, timeoutMs = SERP_TIMEOUT_MS): Promise<CandidateUrl[]> {
  if (!hasBrightDataConfig()) return [];

  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  const response = await fetchWithTimeout(
    REQUEST_ENDPOINT,
    {
      method: "POST",
      headers: brightDataHeaders(),
      body: JSON.stringify({
        zone: process.env.BRIGHTDATA_SERP_ZONE,
        url: googleUrl,
        format: "json"
      })
    },
    timeoutMs
  ).catch(() => null);

  if (!response?.ok) return [];
  const data = await response.json().catch(() => null);
  const payload = unwrapBrightDataPayload(data);
  const results = extractSerpResults(payload);

  return results.slice(0, limit).flatMap((result) => {
    const url = result.link ?? result.url;
    if (!url) return [];
    return [
      {
        url,
        title: result.title ?? url,
        sourceType: sourceTypeForUrl(url),
        discoveryMethod: "SERP API" as const
      }
    ];
  });
}

export async function fetchWithBrightData(candidate: CandidateUrl, vendorDomain?: string, timeoutMs?: number): Promise<SourceDocument | null> {
  const first = await fetchWithUnlocker(candidate, vendorDomain, timeoutMs);
  return first ?? fetchWithBrowserFallback(candidate, vendorDomain, timeoutMs);
}

export async function fetchWithUnlocker(candidate: CandidateUrl, vendorDomain?: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<SourceDocument | null> {
  if (!hasBrightDataConfig()) return null;
  const text = await fetchViaRequest(candidate.url, process.env.BRIGHTDATA_UNLOCKER_ZONE, timeoutMs);
  if (!text || shouldUseBrowserFallback(text)) return null;

  return sourceFromText(candidate, text, "Web Unlocker", vendorDomain);
}

export async function fetchWithBrowserFallback(candidate: CandidateUrl, vendorDomain?: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<SourceDocument | null> {
  if (!hasBrightDataConfig() || !process.env.BRIGHTDATA_BROWSER_ZONE) return null;
  const text = await fetchViaRequest(candidate.url, process.env.BRIGHTDATA_BROWSER_ZONE, timeoutMs);
  if (!text) return null;

  return sourceFromText(candidate, text, BROWSER_ZONE_FALLBACK_METHOD, vendorDomain);
}

export function shouldUseBrowserFallback(text: string) {
  const lower = text.toLowerCase();
  return (
    text.length < 700 ||
    lower.includes("enable javascript") ||
    lower.includes("captcha") ||
    lower.includes("access denied") ||
    lower.includes("please verify you are human")
  );
}

function sourceFromText(
  candidate: CandidateUrl,
  text: string,
  method: "Web Unlocker" | "Browser Zone Fallback",
  vendorDomain?: string
): SourceDocument {
  const fetchedAt = new Date().toISOString();
  const directVendorMatch = Boolean(vendorDomain && candidate.url.includes(vendorDomain));

  return enrichSourceEvidence({
    id: uid("src"),
    url: candidate.url,
    title: candidate.title,
    sourceType: candidate.sourceType,
    fetchedText: compactText(text),
    brightDataMethod: method,
    fetchedAt,
    authorityScore: inferSourceAuthority(candidate.url, candidate.sourceType, vendorDomain),
    recencyScore: 72,
    directnessScore: directVendorMatch ? 88 : 64,
    reliabilityScore: method === "Web Unlocker" ? 82 : 76,
    evidenceGrade: "Moderate",
    evidenceReasoning: "Evidence grade pending source scoring."
  });
}

async function fetchViaRequest(url: string, zone?: string, timeoutMs = FETCH_TIMEOUT_MS) {
  if (!zone) return null;

  const response = await fetchWithTimeout(
    REQUEST_ENDPOINT,
    {
      method: "POST",
      headers: brightDataHeaders(),
      body: JSON.stringify({
        zone,
        url,
        format: "raw"
      })
    },
    timeoutMs
  ).catch(() => null);

  if (!response?.ok) return null;
  const text = await response.text();
  if (text.length < 120) return null;
  return text.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
}

export function unwrapBrightDataPayload(data: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  const body = (data as { body?: unknown }).body;
  if (typeof body === "string") {
    return parseJson(body) ?? data;
  }
  if (body && typeof body === "object") return body;
  return data;
}

export function extractSerpResults(payload: unknown): SerpResult[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as { organic?: SerpResult[]; results?: SerpResult[] };
  if (Array.isArray(record.organic)) return record.organic;
  if (Array.isArray(record.results)) return record.results;
  return [];
}

function parseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}
