import { BrainCircuit, Route } from "lucide-react";
import type { Investigation } from "@/lib/types";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Progress, ScrollArea } from "@/components/ui/primitives";

export function AgentTrace({ investigation }: { investigation: Investigation }) {
  return (
    <Card className="trace-card-shell">
      <CardHeader>
        <div>
          <CardDescription>Agent trace</CardDescription>
          <CardTitle>Decisions and tool calls</CardTitle>
        </div>
        <BrainCircuit size={22} />
      </CardHeader>
      <CardContent>
        <ScrollArea className="trace-scroll">
          {investigation.agentTrace.length === 0 ? (
            <div className="trace-empty">
              <BrainCircuit size={20} />
              <span>Waiting for first agent decision...</span>
            </div>
          ) : null}
          {investigation.agentTrace.map((trace, index) => {
            const delta = Math.max(0, trace.evidenceQualityAfter - trace.evidenceQualityBefore);
            return (
              <article className="trace-item" key={trace.id}>
                <div className="trace-index">{index + 1}</div>
                <div className="trace-body">
                  <div className="trace-topline">
                    <div>
                      <Route size={15} />
                      <strong>{trace.action}</strong>
                    </div>
                    <Badge variant="outline">{trace.tool}</Badge>
                  </div>
                  <p>{trace.rationale}</p>
                  <div className="trace-result">{trace.resultSummary}</div>
                  {trace.whatChanged ? <div className="trace-detail"><strong>Changed</strong><span>{trace.whatChanged}</span></div> : null}
                  {trace.confidenceReasoning ? <div className="trace-detail"><strong>Confidence</strong><span>{trace.confidenceReasoning}</span></div> : null}
                  {trace.whySelected?.length ? (
                    <TraceList label="Selected" items={trace.whySelected} />
                  ) : null}
                  {trace.whySkipped?.length ? (
                    <TraceList label="Skipped" items={trace.whySkipped} />
                  ) : null}
                  <div className="trace-quality">
                    <span>
                      Evidence {trace.evidenceQualityBefore} to {trace.evidenceQualityAfter}
                      {delta > 0 ? ` (+${delta})` : ""}
                    </span>
                    <Progress value={trace.evidenceQualityAfter} />
                  </div>
                </div>
              </article>
            );
          })}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function TraceList({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="trace-mini-list">
      <strong>{label}</strong>
      {items.slice(0, 4).map((item) => (
        <span key={item}>{item}</span>
      ))}
    </div>
  );
}
