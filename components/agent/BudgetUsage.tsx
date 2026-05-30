import type { Investigation } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Progress } from "@/components/ui/primitives";
import { percent } from "@/components/agent/format";

export function BudgetUsage({ investigation }: { investigation: Investigation }) {
  const items = [
    ["Iterations", investigation.budgetUsed.iterations, investigation.budget.maxIterations],
    ["Searches", investigation.budgetUsed.searches, investigation.budget.maxSearches],
    ["Fetches", investigation.budgetUsed.fetches, investigation.budget.maxFetches],
    ["Final sources", investigation.budgetUsed.finalSources, investigation.budget.maxFinalSources]
  ] as const;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardDescription>Budget usage</CardDescription>
          <CardTitle>Bounded autonomy</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="budget-list">
        {items.map(([label, used, max]) => (
          <div className="budget-row" key={label}>
            <div>
              <span>{label}</span>
              <strong>
                {used}<small>/{max}</small>
              </strong>
            </div>
            <Progress value={percent(used, max)} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
