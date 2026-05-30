import type { CandidateUrl, SourceType } from "@/lib/types";

export function cn(...inputs: Array<string | false | null | undefined>) {
  return inputs.filter(Boolean).join(" ");
}

export function normalizeDomain(input?: string) {
  if (!input) return "";
  return input
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .toLowerCase();
}

export function normalizeUrl(url: string) {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    parsed.hash = "";
    parsed.search = "";
    parsed.hostname = parsed.hostname.replace(/^www\./, "").toLowerCase();
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url.trim();
  }
}

export function sourceTypeForUrl(url: string): SourceType {
  const lower = url.toLowerCase();
  if (lower.includes("sec.gov") || lower.includes("justice.gov") || lower.includes("ftc.gov")) return "regulatory";
  if (lower.includes("cve") || lower.includes("nvd.nist") || lower.includes("security")) return "security";
  if (lower.includes("lawsuit") || lower.includes("court") || lower.includes("legal")) return "legal";
  if (lower.includes("g2.com") || lower.includes("trustpilot") || lower.includes("reviews")) return "review";
  if (lower.includes("news") || lower.includes("reuters") || lower.includes("bloomberg")) return "news";
  return "unknown";
}

export function dedupeCandidateUrls(candidates: CandidateUrl[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const normalized = normalizeUrl(candidate.url);
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    candidate.url = normalized;
    return true;
  });
}

export function inferSourceAuthority(url: string, sourceType: SourceType, vendorDomain?: string) {
  const host = safeHost(url);
  if (vendorDomain && host.endsWith(vendorDomain)) return 88;
  if (sourceType === "regulatory") return 94;
  if (sourceType === "security") return 86;
  if (sourceType === "news") return 78;
  if (sourceType === "legal") return 76;
  if (sourceType === "review") return 58;
  return 52;
}

export function safeHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function compactText(text: string, maxLength = 5000) {
  return text.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
