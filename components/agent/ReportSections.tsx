import { AlertTriangle, CheckCircle2, ExternalLink, Gauge, ShieldCheck } from "lucide-react";
import type { Investigation } from "@/lib/types";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Progress, ScrollArea } from "@/components/ui/primitives";

export function ReportSections({ investigation }: { investigation: Investigation }) {
  const report = investigation.report;
  const topSignals = [...investigation.signals].sort((a, b) => b.severity - a.severity).slice(0, 4);

  return (
    <>
      <Card className="score-card">
        <CardHeader>
          <div>
            <CardDescription>Risk report</CardDescription>
            <CardTitle>Evidence-backed output</CardTitle>
          </div>
          <Gauge size={22} />
        </CardHeader>
        <CardContent className="score-grid">
          <ScoreMetric label="Risk Score" value={report?.score} />
          <ScoreMetric label="Confidence" value={report?.confidence} />
          <ScoreMetric label="Evidence Quality" value={report?.evidenceQuality} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardDescription>Procurement memo</CardDescription>
            <CardTitle>Why this matters</CardTitle>
          </div>
          <ShieldCheck size={22} />
        </CardHeader>
        <CardContent>
          <p className="memo-text">{report?.whyThisMatters ?? "Run an investigation to generate a buyer-facing memo."}</p>
          <div className="action-list">
            {(report?.actions ?? []).map((action) => (
              <div key={action}>
                <CheckCircle2 size={16} />
                <span>{action}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardDescription>Risk signals</CardDescription>
            <CardTitle>Top findings</CardTitle>
          </div>
          <AlertTriangle size={22} />
        </CardHeader>
        <CardContent className="signal-list">
          {topSignals.map((signal) => (
            <article className="signal-item" key={signal.id}>
              <div>
                <Badge variant="warning">{signal.category}</Badge>
                <Badge variant="outline">Severity {signal.severity}/10</Badge>
                {signal.evidenceGrade ? <Badge variant={signal.evidenceGrade === "Strong" ? "success" : signal.evidenceGrade === "Weak" ? "danger" : "secondary"}>{signal.evidenceGrade} evidence</Badge> : null}
              </div>
              <strong>{signal.summary}</strong>
              <p>{signal.evidenceSnippet}</p>
              {signal.evidenceReasoning ? <p className="evidence-reasoning">{signal.evidenceReasoning}</p> : null}
              <footer>
                <span>Confidence {signal.confidence}</span>
                <span>Corroboration {signal.corroborationCount}</span>
              </footer>
            </article>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardDescription>Source evidence</CardDescription>
            <CardTitle>Fetched documents</CardTitle>
          </div>
          <Badge variant="secondary">{investigation.sources.length} sources</Badge>
        </CardHeader>
        <CardContent>
          <ScrollArea className="evidence-scroll">
            {investigation.sources.map((source) => (
              <article className="evidence-item" key={source.id}>
                <div>
                  <strong>{source.title}</strong>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.url}
                    <ExternalLink size={13} />
                  </a>
                </div>
                <p>{source.fetchedText.slice(0, 240)}</p>
                <footer>
                  <Badge variant="secondary">{source.sourceType}</Badge>
                  <Badge variant="outline">{source.brightDataMethod}</Badge>
                  <span>Evidence {source.evidenceGrade}</span>
                  <span>Authority {source.authorityScore}</span>
                  <span>Recency {source.recencyScore}</span>
                  <span>Reliability {source.reliabilityScore}</span>
                </footer>
                <small>{source.evidenceReasoning}</small>
              </article>
            ))}
          </ScrollArea>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardDescription>Watchlist</CardDescription>
            <CardTitle>Triggers</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="watch-list">
          {(report?.watchlistTriggers ?? []).map((trigger) => (
            <div key={trigger}>
              <span />
              <p>{trigger}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

function ScoreMetric({ label, value }: { label: string; value?: number }) {
  return (
    <div className="score-metric">
      <span>{label}</span>
      <strong>{value ?? "--"}</strong>
      <Progress value={value ?? 0} />
    </div>
  );
}
