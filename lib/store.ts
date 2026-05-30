import type { Investigation } from "@/lib/types";

const globalForStore = globalThis as unknown as {
  riftsignalInvestigations?: Map<string, Investigation>;
};

export const investigations =
  globalForStore.riftsignalInvestigations ?? new Map<string, Investigation>();

globalForStore.riftsignalInvestigations = investigations;

export function saveInvestigation(investigation: Investigation) {
  investigations.set(investigation.id, investigation);
  return investigation;
}

export function getInvestigation(id: string) {
  return investigations.get(id);
}

export function patchInvestigation(id: string, patch: Partial<Investigation>) {
  const existing = investigations.get(id);
  if (!existing) return undefined;

  const updated = {
    ...existing,
    ...patch,
    id: existing.id,
    input: patch.input ?? existing.input,
    version: existing.version + 1,
    updatedAt: new Date().toISOString()
  };

  investigations.set(id, updated);
  return updated;
}

export function replaceInvestigation(id: string, investigation: Investigation) {
  const existing = investigations.get(id);
  const updated = {
    ...investigation,
    id,
    version: (existing?.version ?? 0) + 1,
    updatedAt: new Date().toISOString()
  };

  investigations.set(id, updated);
  return updated;
}
