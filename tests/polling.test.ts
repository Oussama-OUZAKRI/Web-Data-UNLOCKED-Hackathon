import { describe, expect, it } from "vitest";
import { createQueuedInvestigation } from "@/lib/investigation-engine";
import { mergeInvestigationHistory, shouldAcceptInvestigationUpdate } from "@/lib/client-merge";
import { patchInvestigation, saveInvestigation } from "@/lib/store";

describe("polling lifecycle", () => {
  it("creates queued investigations with progress metadata", () => {
    const queued = createQueuedInvestigation({
      vendorName: "Acme CloudWorks",
      domain: "acmecloudworks.example"
    });

    expect(queued.status).toBe("running");
    expect(queued.version).toBe(1);
    expect(queued.currentStep).toBe("queued");
    expect(queued.statusMessage).toBe("Investigation queued.");
    expect(queued.completionType).toBe("partial");
    expect(queued.selectedSources).toEqual([]);
    expect(queued.budget.maxIterations).toBeGreaterThan(0);
  });

  it("patching increments version and updates progress fields", () => {
    const queued = createQueuedInvestigation({
      vendorName: "Patch Vendor"
    });
    saveInvestigation(queued);

    const updated = patchInvestigation(queued.id, {
      currentStep: "searching",
      statusMessage: "Searching for public evidence."
    });

    expect(updated?.version).toBe(2);
    expect(updated?.currentStep).toBe("searching");
    expect(updated?.statusMessage).toBe("Searching for public evidence.");
    expect(updated?.updatedAt).toBeTruthy();
  });

  it("ignores stale investigation responses by version", () => {
    const current = {
      ...createQueuedInvestigation({ vendorName: "Current Vendor" }),
      version: 3
    };
    const stale = {
      ...current,
      version: 2
    };
    const fresh = {
      ...current,
      version: 4
    };

    expect(shouldAcceptInvestigationUpdate(current, stale)).toBe(false);
    expect(shouldAcceptInvestigationUpdate(current, fresh)).toBe(true);
  });

  it("merges updated investigations into history without duplicates", () => {
    const first = createQueuedInvestigation({ vendorName: "First" });
    const second = createQueuedInvestigation({ vendorName: "Second" });
    const updatedFirst = { ...first, version: 2, statusMessage: "Updated" };

    const history = mergeInvestigationHistory([second, first], updatedFirst);

    expect(history).toHaveLength(2);
    expect(history[0].id).toBe(first.id);
    expect(history[0].statusMessage).toBe("Updated");
  });
});
