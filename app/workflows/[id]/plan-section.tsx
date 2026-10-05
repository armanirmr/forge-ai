import { eq } from "drizzle-orm";
import { ImplementationPlanSchema } from "@/ai/schemas/implementation-plan";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { implementationPlans } from "@/lib/db/schema";
import { generatePlanAction } from "./actions";

function Items({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1">
      <h4 className="text-xs font-medium uppercase text-muted-foreground">{title}</h4>
      <ul className="list-disc space-y-0.5 pl-5 text-sm">
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

export async function PlanSection({
  workflowId,
  status,
  error,
}: {
  workflowId: string;
  status: string;
  error: string | null;
}) {
  const [row] = await db
    .select()
    .from(implementationPlans)
    .where(eq(implementationPlans.workflowId, workflowId));
  const plan = row ? ImplementationPlanSchema.safeParse(row.result) : null;

  const canGenerate = status === "analysis_completed" && !row;
  if (!row && !canGenerate && status !== "planning") return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-medium">Implementation plan</h2>
        {plan?.success && <Badge variant="outline">Draft, not approved</Badge>}
        {status === "planning" && <Badge variant="secondary">planning</Badge>}
      </div>

      {canGenerate && (
        <>
          {error && (
            <div role="alert" className="rounded border border-red-500/50 p-4 text-sm text-red-600">
              <p className="font-medium">Plan generation failed. The analysis above is unchanged.</p>
              <p className="mt-1 break-words">{error}</p>
            </div>
          )}
          <form action={generatePlanAction} className="space-y-2">
            <input type="hidden" name="workflowId" value={workflowId} />
            <Button type="submit">Generate implementation plan</Button>
            <p className="text-xs text-muted-foreground">
              Sends the requirement, the analysis above and selected, secret-redacted code snippets
              to the configured AI provider.
            </p>
          </form>
        </>
      )}

      {status === "planning" && !row && (
        <p className="text-sm text-muted-foreground">
          A plan is being generated. If this stays here after a minute, the request was
          interrupted.
        </p>
      )}

      {plan && !plan.success && (
        <p role="alert" className="rounded border border-red-500/50 p-4 text-sm text-red-600">
          Stored plan no longer matches the current schema and was not rendered.
        </p>
      )}

      {plan?.success && (
        <div className="space-y-5">
          <p className="text-sm">{plan.data.approach}</p>
          <Items title="Architecture notes" items={plan.data.architectureNotes} />

          <ol className="divide-y rounded border">
            {plan.data.tasks.map((t) => (
              <li key={t.id} className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs">{t.id}</span>
                  <span className="flex-1 text-sm font-medium">{t.title}</span>
                  <Badge variant={t.risk === "high" ? "destructive" : "outline"}>risk {t.risk}</Badge>
                  <Badge variant="secondary">{t.estimatedComplexity}</Badge>
                </div>
                <p className="text-sm">{t.description}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  Serves {t.requirementIds.join(", ")}
                  {t.dependencies.length > 0 && ` · after ${t.dependencies.join(", ")}`}
                </p>
                {(t.modifiesFiles.length > 0 || t.createsFiles.length > 0) && (
                  <ul className="space-y-0.5 font-mono text-xs">
                    {t.modifiesFiles.map((f) => (
                      <li key={`m-${f}`}>~ {f}</li>
                    ))}
                    {t.createsFiles.map((f) => (
                      <li key={`c-${f}`}>+ {f}</li>
                    ))}
                  </ul>
                )}
                <Items title="Acceptance criteria" items={t.acceptanceCriteria} />
              </li>
            ))}
          </ol>

          <Items title="Plan risks" items={plan.data.risks} />
          <Items title="Plan open questions" items={plan.data.openQuestions} />
        </div>
      )}
    </section>
  );
}
