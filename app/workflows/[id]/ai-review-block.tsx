import { desc, eq } from "drizzle-orm";
import { CHANGE_REVIEW_PROMPT_VERSION } from "@/ai/prompts/change-review";
import { ChangeReviewSchema } from "@/ai/schemas/change-review";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { aiRuns, changeReviews } from "@/lib/db/schema";
import { runAiReviewAction } from "./actions";

const SEVERITY_VARIANT = { high: "destructive", medium: "secondary", low: "outline" } as const;

const COVERAGE_LABEL = {
  implemented_and_tested: "implemented and tested",
  implemented_not_tested: "implemented, not tested",
  not_implemented: "not implemented",
  unclear: "unclear",
} as const;

export async function AiReviewBlock({
  workflowId,
  editsHash,
}: {
  workflowId: string;
  editsHash: string;
}) {
  const rows = await db
    .select()
    .from(changeReviews)
    .where(eq(changeReviews.workflowId, workflowId))
    .orderBy(desc(changeReviews.createdAt));
  const current = rows.find((r) => r.editsHash === editsHash);
  const earlierOnly = rows.length > 0 && !current;
  const [currentRun] = current?.aiRunId
    ? await db
        .select({ promptVersion: aiRuns.promptVersion })
        .from(aiRuns)
        .where(eq(aiRuns.id, current.aiRunId))
        .limit(1)
    : [];
  const promptOutdated =
    current?.status === "completed" &&
    currentRun?.promptVersion !== CHANGE_REVIEW_PROMPT_VERSION;
  const parsed = current?.status === "completed" ? ChangeReviewSchema.safeParse(current.result) : null;
  const canRun = !current || current.status === "failed" || promptOutdated;

  return (
    <div className="space-y-3 rounded border p-3">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-medium">AI review</h3>
        <Badge variant="outline">opinion, not verified</Badge>
      </div>

      {current?.status === "failed" && (
        <p role="alert" className="text-sm break-words text-red-600">
          The AI review failed: {current.error}
        </p>
      )}
      {earlierOnly && (
        <p className="text-xs text-muted-foreground">
          An earlier AI review exists for different edits, so it is not shown.
        </p>
      )}
      {promptOutdated && (
        <p className="text-xs text-muted-foreground">
          A newer reviewer prompt is available. Run the review again to use it.
        </p>
      )}

      {canRun && (
        <form action={runAiReviewAction} className="space-y-2">
          <input type="hidden" name="workflowId" value={workflowId} />
          <Button type="submit" variant="outline">
            {promptOutdated ? "Rerun with updated prompt" : "Run AI review"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Sends the requirement, analysis, plan tasks, verification summary and the diff (secret-redacted)
            to the configured AI provider in one request. It is an opinion: it cannot approve, reject or
            block anything.
          </p>
        </form>
      )}

      {parsed && !parsed.success && (
        <p className="text-sm text-red-600">
          The stored review no longer matches the current schema and was not rendered.
        </p>
      )}

      {parsed?.success && (
        <div className="space-y-3">
          <p className="text-sm">{parsed.data.summary}</p>

          <div className="space-y-1">
            <p className="text-xs font-medium">Acceptance criteria</p>
            <ul className="space-y-1 text-sm">
              {parsed.data.criteriaCoverage.map((c) => (
                <li key={c.criterionId}>
                  <span className="font-mono text-xs">{c.criterionId}</span>{" "}
                  <Badge variant={c.status === "not_implemented" ? "destructive" : "outline"}>
                    {COVERAGE_LABEL[c.status]}
                  </Badge>{" "}
                  <span className="text-muted-foreground">{c.note}</span>
                </li>
              ))}
            </ul>
          </div>

          {parsed.data.findings.length === 0 && (
            <p className="text-sm text-muted-foreground">No findings reported.</p>
          )}
          {parsed.data.findings.map((f, i) => (
            <div key={i} className="space-y-1 rounded border p-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={SEVERITY_VARIANT[f.severity]}>{f.severity}</Badge>
                <span className="text-xs text-muted-foreground">{f.category.replace("_", " ")}</span>
                {f.path && <span className="font-mono text-xs">{f.path}</span>}
                {f.criterionId && <span className="font-mono text-xs">{f.criterionId}</span>}
              </div>
              <p className="font-medium">{f.title}</p>
              <p>{f.detail}</p>
              {f.evidence && (
                <code className="block overflow-x-auto rounded bg-muted px-2 py-1 text-xs whitespace-pre">
                  {f.evidence}
                </code>
              )}
            </div>
          ))}

          <p className="text-xs text-muted-foreground">
            Every quoted line was checked to exist in the diff. That does not mean the finding is right.
            Prompt {CHANGE_REVIEW_PROMPT_VERSION}.
          </p>
        </div>
      )}
    </div>
  );
}
