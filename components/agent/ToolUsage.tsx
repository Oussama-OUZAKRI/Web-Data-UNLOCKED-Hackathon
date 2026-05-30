import type { Investigation } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";

export function ToolUsage({ investigation }: { investigation: Investigation }) {
  const tools = [
    ["LLM calls", investigation.toolUsage.openai],
    ["SERP calls", investigation.toolUsage.serp],
    ["Web Unlocker", investigation.toolUsage.webUnlocker],
    ["Browser-zone fallback", investigation.toolUsage.browserApi],
    ["Seeded cache", investigation.toolUsage.seededCache]
  ] as const;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardDescription>Tool usage</CardDescription>
          <CardTitle>Execution counters</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="tool-matrix">
        {tools.map(([label, value]) => (
          <div className="tool-tile" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
