import { NextResponse } from "next/server";
import { getInvestigation, saveInvestigation } from "@/lib/store";
import { createQueuedInvestigation, runInvestigationIntoStore } from "@/lib/investigation-engine";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = getInvestigation(id);

  if (!existing) {
    return NextResponse.json({ error: "Investigation not found" }, { status: 404 });
  }

  const queued = createQueuedInvestigation({
    ...existing.input,
    forceLive: true
  });
  queued.mode = "live-agent";
  queued.statusMessage = "Live refresh queued.";

  saveInvestigation(queued);
  void runInvestigationIntoStore(queued.id, queued.input);
  return NextResponse.json(queued);
}
