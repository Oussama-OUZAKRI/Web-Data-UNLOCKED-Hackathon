import { describe, expect, it } from "vitest";
import { dedupeCandidateUrls, normalizeDomain, normalizeUrl } from "@/lib/utils";

describe("url utilities", () => {
  it("normalizes domains from full URLs", () => {
    expect(normalizeDomain("https://www.vendor.com/security")).toBe("vendor.com");
  });

  it("normalizes URLs for deduplication", () => {
    expect(normalizeUrl("https://www.vendor.com/path?utm=1#top")).toBe("https://vendor.com/path");
  });

  it("deduplicates candidates by normalized URL", () => {
    const result = dedupeCandidateUrls([
      {
        url: "https://www.vendor.com/security?utm=1",
        title: "Security",
        sourceType: "official",
        discoveryMethod: "SERP API"
      },
      {
        url: "https://vendor.com/security",
        title: "Security duplicate",
        sourceType: "official",
        discoveryMethod: "SERP API"
      }
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("https://vendor.com/security");
  });
});
