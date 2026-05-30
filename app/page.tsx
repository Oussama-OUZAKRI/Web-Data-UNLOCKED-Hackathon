"use client";

import { Building2, FileSearch, Loader2, RefreshCw, SearchCheck, Sparkles, Timer } from "lucide-react";
import { FormEvent, useState } from "react";
import { AgentTrace } from "@/components/agent/AgentTrace";
import { BudgetUsage } from "@/components/agent/BudgetUsage";
import { formatTime, labelize } from "@/components/agent/format";
import { ProgressOverview } from "@/components/agent/ProgressOverview";
import { ReportSections } from "@/components/agent/ReportSections";
import { SelectedSources } from "@/components/agent/SelectedSources";
import { ToolUsage } from "@/components/agent/ToolUsage";
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, ScrollArea, Textarea } from "@/components/ui/primitives";
import { mergeInvestigationHistory, shouldAcceptInvestigationUpdate } from "@/lib/client-merge";
import { DEMO_VENDORS } from "@/lib/seed-data";
import type { Investigation } from "@/lib/types";

const emptyForm = {
  vendorName: DEMO_VENDORS[0].vendorName,
  domain: DEMO_VENDORS[0].domain,
  riskFocus: DEMO_VENDORS[0].riskFocus
};

export default function Home() {
  const [form, setForm] = useState(emptyForm);
  const [investigation, setInvestigation] = useState<Investigation | null>(null);
  const [history, setHistory] = useState<Investigation[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const isRunning = investigation?.status === "queued" || investigation?.status === "running";

  async function runInvestigation(event?: FormEvent) {
    event?.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/investigations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Investigation failed");
      acceptInvestigation(data);
      pollInvestigation(data.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Investigation failed");
    } finally {
      setLoading(false);
    }
  }

  async function refreshLive() {
    if (!investigation) return;
    setRefreshing(true);
    setError("");

    try {
      const response = await fetch(`/api/investigations/${investigation.id}/refresh`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Live refresh failed");
      acceptInvestigation(data);
      pollInvestigation(data.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Live refresh failed");
    } finally {
      setRefreshing(false);
    }
  }

  function acceptInvestigation(incoming: Investigation) {
    setInvestigation((current) => {
      if (!shouldAcceptInvestigationUpdate(current, incoming)) return current;
      return incoming;
    });
    setHistory((current) => mergeInvestigationHistory(current, incoming));
  }

  function pollInvestigation(id: string) {
    window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/investigations/${id}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Polling failed");
        acceptInvestigation(data);
        if (data.status === "queued" || data.status === "running") pollInvestigation(id);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Polling failed");
      }
    }, 1000);
  }

  return (
    <main className="app-shell">
      <aside className="left-rail">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Sparkles size={18} />
          </div>
          <div>
            <strong>RiftSignal AI</strong>
            <span>Bounded vendor-risk agent</span>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardDescription>Investigation input</CardDescription>
            <CardTitle>Vendor profile</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="control-form" onSubmit={runInvestigation}>
              <div>
                <Label htmlFor="vendor">Vendor</Label>
                <Input id="vendor" value={form.vendorName} onChange={(event) => setForm({ ...form, vendorName: event.target.value })} placeholder="Vendor name" />
              </div>
              <div>
                <Label htmlFor="domain">Domain</Label>
                <Input id="domain" value={form.domain} onChange={(event) => setForm({ ...form, domain: event.target.value })} placeholder="vendor.com" />
              </div>
              <div>
                <Label htmlFor="focus">Risk focus</Label>
                <Textarea
                  id="focus"
                  value={form.riskFocus}
                  onChange={(event) => setForm({ ...form, riskFocus: event.target.value })}
                  placeholder="Security, compliance, service reliability..."
                />
              </div>
              <Button disabled={loading || isRunning || !form.vendorName.trim()}>
                {loading ? <Loader2 className="spin" size={17} /> : <FileSearch size={17} />}
                Run investigation
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Reliable rehearsal data</CardDescription>
            <CardTitle>Demo vendors</CardTitle>
          </CardHeader>
          <CardContent className="demo-vendors">
            {DEMO_VENDORS.map((vendor) => (
              <button key={vendor.vendorName} onClick={() => setForm(vendor)}>
                <strong>{vendor.vendorName}</strong>
                <span>{vendor.riskFocus}</span>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="history-card">
          <CardHeader>
            <CardDescription>Local session</CardDescription>
            <CardTitle>Recent runs</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="history-scroll">
              {history.length === 0 ? <p className="muted-copy">No investigations yet.</p> : null}
              {history.map((item) => (
                <button className="history-item" key={item.id} onClick={() => setInvestigation(item)}>
                  <span>{item.input.vendorName}</span>
                  <strong>{item.report?.rating ?? labelize(item.status)}</strong>
                  <small>{labelize(item.mode)} · v{item.version}</small>
                </button>
              ))}
            </ScrollArea>
          </CardContent>
        </Card>
      </aside>

      <section className="main-cockpit">
        <header className="command-bar">
          <div>
            <span className="eyebrow">Agent observability cockpit</span>
            <h1>Live web-data investigation, bounded and explainable.</h1>
          </div>
          <div className="command-actions">
            {investigation ? (
              <>
                <Badge variant={investigation.liveDataUsed ? "success" : "secondary"}>{investigation.liveDataUsed ? "Live Agent" : labelize(investigation.mode)}</Badge>
                <Badge variant={investigation.completionType === "full" ? "success" : investigation.completionType === "fallback" ? "secondary" : "warning"}>
                  {labelize(investigation.completionType)}
                </Badge>
                <Badge variant={isRunning ? "warning" : "outline"}>{labelize(investigation.status)}</Badge>
              </>
            ) : null}
            <Button variant="outline" disabled={!investigation || refreshing || isRunning} onClick={refreshLive}>
              {refreshing ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />}
              Refresh live data
            </Button>
          </div>
        </header>

        {error ? <Alert>{error}</Alert> : null}

        {!investigation ? (
          <EmptyState onStart={() => runInvestigation()} loading={loading} />
        ) : (
          <div className="cockpit-grid">
            <div className="primary-column">
              <ProgressOverview investigation={investigation} />
              <StopReason investigation={investigation} />
              <BudgetUsage investigation={investigation} />
              <ToolUsage investigation={investigation} />
              <SelectedSources investigation={investigation} />
              <AgentTrace investigation={investigation} />
            </div>
            <div className="report-column">
              <ReportSections investigation={investigation} />
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function EmptyState({ onStart, loading }: { onStart: () => void; loading: boolean }) {
  return (
    <Card className="empty-state">
      <SearchCheck size={42} />
      <CardTitle>Start an investigation to watch the agent work.</CardTitle>
      <CardDescription>
        The cockpit will show current step, status message, stop reason, strict budgets, tool counters, and every trace decision as polling updates arrive.
      </CardDescription>
      <Button onClick={onStart} disabled={loading}>
        {loading ? <Loader2 className="spin" size={17} /> : <Sparkles size={17} />}
        Run Acme CloudWorks
      </Button>
    </Card>
  );
}

function StopReason({ investigation }: { investigation: Investigation }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardDescription>Stop reason</CardDescription>
          <CardTitle>{labelize(investigation.stopReason)}</CardTitle>
        </div>
        <Timer size={22} />
      </CardHeader>
      <CardContent>
        <p className="stop-detail">{investigation.stopReasonDetail}</p>
        <div className="stop-meta">
          <span>{labelize(investigation.completionType)} completion</span>
          <span>Updated {formatTime(investigation.updatedAt)}</span>
          <span>Version {investigation.version}</span>
        </div>
      </CardContent>
    </Card>
  );
}
