import { ListChecks } from "lucide-react";
import type { Investigation } from "@/lib/types";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, ScrollArea } from "@/components/ui/primitives";

export function SelectedSources({ investigation }: { investigation: Investigation }) {
  const items = investigation.selectedSources ?? [];

  return (
    <Card>
      <CardHeader>
        <div>
          <CardDescription>Selected sources</CardDescription>
          <CardTitle>Evidence trail</CardTitle>
        </div>
        <ListChecks size={22} />
      </CardHeader>
      <CardContent>
        <ScrollArea className="selected-source-scroll">
          {items.length === 0 ? <p className="muted-copy">No sources selected yet.</p> : null}
          {items.map((source) => (
            <article className="selected-source-item" key={source.id}>
              <div>
                <strong>{source.title}</strong>
                <Badge variant={source.status === "fetched" ? "success" : source.status === "failed" ? "danger" : source.status === "skipped" ? "secondary" : "outline"}>
                  {source.status}
                </Badge>
              </div>
              <a href={source.url} target="_blank" rel="noreferrer">{source.url}</a>
              <p>{source.selectionReason}</p>
              <footer>
                <Badge variant="secondary">{source.sourceType}</Badge>
                {source.fetchMethod ? <Badge variant="outline">{source.fetchMethod}</Badge> : null}
                {source.evidenceGrade ? <span>Evidence {source.evidenceGrade}</span> : null}
              </footer>
              {source.evidenceReasoning ? <small>{source.evidenceReasoning}</small> : null}
            </article>
          ))}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
