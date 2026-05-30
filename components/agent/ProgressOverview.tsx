import { Activity, Clock3, Hash, Info, TimerReset } from "lucide-react";
import type { ReactNode } from "react";
import type { Investigation } from "@/lib/types";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Progress } from "@/components/ui/primitives";
import { formatTime, labelize } from "@/components/agent/format";

export function ProgressOverview({ investigation }: { investigation: Investigation }) {
  const running = investigation.status === "queued" || investigation.status === "running";

  return (
    <Card className="progress-card">
      <CardHeader>
        <div>
          <CardDescription>Current progress</CardDescription>
          <CardTitle>{labelize(investigation.currentStep)}</CardTitle>
        </div>
        <Badge variant={running ? "warning" : "success"}>{investigation.status}</Badge>
      </CardHeader>
      <CardContent>
        <div className="status-message">
          <Activity size={18} />
          <strong>{investigation.statusMessage}</strong>
        </div>
        <div className="progress-pulse">
          <Progress value={running ? 45 : 100} />
        </div>
        <div className="meta-grid">
          <Meta icon={<Hash size={15} />} label="Version" value={String(investigation.version)} />
          <Meta icon={<Clock3 size={15} />} label="Updated" value={formatTime(investigation.updatedAt)} />
          <Meta icon={<Info size={15} />} label="Mode" value={investigation.liveDataUsed ? "Live Agent" : labelize(investigation.mode)} />
          <Meta icon={<TimerReset size={15} />} label="Completion" value={labelize(investigation.completionType)} />
        </div>
      </CardContent>
    </Card>
  );
}

function Meta({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="meta-tile">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
