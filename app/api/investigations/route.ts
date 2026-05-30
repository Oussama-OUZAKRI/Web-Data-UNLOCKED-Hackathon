import { NextResponse } from "next/server";
import { createQueuedInvestigation, runInvestigationIntoStore } from "@/lib/investigation-engine";
import { saveInvestigation } from "@/lib/store";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = {
      vendorName: String(body.vendorName ?? ""),
      domain: body.domain ? String(body.domain) : undefined,
      riskFocus: body.riskFocus ? String(body.riskFocus) : undefined,
      forceLive: Boolean(body.forceLive)
    };
    const investigation = createQueuedInvestigation(input);

    saveInvestigation(investigation);
    void runInvestigationIntoStore(investigation.id, investigation.input);
    return NextResponse.json(investigation);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to run investigation" },
      { status: 400 }
    );
  }
}
