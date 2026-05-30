import { describe, expect, it } from "vitest";
import { BROWSER_ZONE_FALLBACK_METHOD, extractSerpResults, shouldUseBrowserFallback, unwrapBrightDataPayload } from "@/lib/brightdata";

describe("Bright Data response handling", () => {
  it("unwraps Light JSON returned inside Bright Data body", () => {
    const payload = unwrapBrightDataPayload({
      status_code: 200,
      headers: {},
      body: JSON.stringify({
        organic: [
          {
            link: "https://example.com/security",
            title: "Security result"
          }
        ]
      })
    });

    expect(extractSerpResults(payload)).toEqual([
      {
        link: "https://example.com/security",
        title: "Security result"
      }
    ]);
  });

  it("still accepts direct parsed organic results", () => {
    const payload = unwrapBrightDataPayload({
      organic: [
        {
          url: "https://example.com/status",
          title: "Status result"
        }
      ]
    });

    expect(extractSerpResults(payload)).toHaveLength(1);
  });

  it("flags short or blocked content for browser-zone fallback", () => {
    expect(shouldUseBrowserFallback("enable javascript")).toBe(true);
    expect(shouldUseBrowserFallback("x".repeat(800))).toBe(false);
  });

  it("uses an honest browser-zone fallback label", () => {
    expect(BROWSER_ZONE_FALLBACK_METHOD).toBe("Browser Zone Fallback");
  });
});
