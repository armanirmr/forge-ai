import { eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { changeApprovals } from "@/lib/db/schema";
import { loadReview } from "@/lib/workflows/review-changes";
import { approveChangesAction, rejectChangesAction } from "./actions";
import { AiReviewBlock } from "./ai-review-block";
import { PullRequestBlock } from "./pull-request-block";
import { ReviewDiffControls } from "./review-diff-controls";
import { auth } from "@/auth";
import { ChevronDown } from "lucide-react";

const LINE_TONE = {
  "+": "bg-green-500/10 text-green-700 dark:text-green-400",
  "-": "bg-red-500/10 text-red-700 dark:text-red-400",
  " ": "text-muted-foreground",
} as const;

const REVIEW_STATUSES = ["changes_generated", "changes_approved", "changes_rejected"];

export async function ReviewSection({
  workflowId,
  repositoryId,
  status,
}: {
  workflowId: string;
  repositoryId: string;
  status: string;
}) {
  if (!REVIEW_STATUSES.includes(status)) return null;

  let review: Awaited<ReturnType<typeof loadReview>> | null = null;
  let loadError: string | null = null;
  try {
    review = await loadReview(workflowId, repositoryId, status);
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }

  const [decision] = await db
    .select()
    .from(changeApprovals)
    .where(eq(changeApprovals.workflowId, workflowId));

  if (!review) {
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Review</h2>
        <p role="alert" className="rounded border border-red-500/50 p-3 text-sm break-words text-red-600">
          The review could not be built: {loadError}
        </p>
      </section>
    );
  }

  const canDecide = status === "changes_generated";
  const editsChanged = decision ? decision.editsHash !== review.editsHash : false;
  const session = await auth();
  const userId = session?.user?.email ?? session?.user?.name ?? "unknown";
  const canCreatePullRequest = status === "changes_approved" &&
    decision?.decision === "approved" && !editsChanged &&
    decision.decidedBy === `user:${userId}` &&
    review.traceBlockers.length === 0 &&
    review.latestRun?.status === "passed" && review.verificationCurrent;
  const addedLines = review.files.reduce((total, file) => total + file.added, 0);
  const removedLines = review.files.reduce((total, file) => total + file.removed, 0);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-medium">Review</h2>
        {decision?.decision === "approved" && <Badge variant="success">approved</Badge>}
        {decision?.decision === "rejected" && <Badge variant="destructive">rejected</Badge>}
        {!decision && <Badge variant="outline">awaiting decision</Badge>}
      </div>

      <div className="rounded-md border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
        <p className="font-medium">Review the diff before creating a pull request.</p>
        <p className="mt-1 text-muted-foreground">
          Approval records your decision for this exact diff. It does not write to GitHub; creating a pull request is a separate step available after approval and current passing verification.
        </p>
      </div>

      <p className="text-sm text-muted-foreground">
        Final diff · {review.files.length} {review.files.length === 1 ? "file" : "files"} · <span className="text-green-700 dark:text-green-400">+{addedLines}</span> / <span className="text-red-700 dark:text-red-400">−{removedLines}</span> lines · includes {review.repairCount} accepted repair{review.repairCount === 1 ? "" : "s"}.
        A passing verification means the repository scripts exited 0.
      </p>

      {canDecide && review.blockers.length > 0 && (
        <div role="alert" className="rounded-md border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm">
          <p className="font-semibold">Approval is unavailable until this review is complete.</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
            {review.blockers.map((blocker, index) => <li key={`${index}-${blocker}`}>{blocker}</li>)}
          </ul>
        </div>
      )}

      <section aria-labelledby="requirements-addressed-title" className="space-y-2">
        <div>
          <h3 id="requirements-addressed-title" className="text-sm font-semibold">Requirements addressed</h3>
          <p className="mt-1 text-xs text-muted-foreground">Linked through the implementation-plan task IDs attached to each generated or repaired edit.</p>
        </div>
        {review.requirements.length > 0 ? (
          <ul className="divide-y border-y">
            {review.requirements.map((requirement) => (
              <li key={requirement.id} className="grid gap-2 py-3 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:gap-4">
                <span className="font-mono text-xs font-semibold text-primary">{requirement.id}</span>
                <div className="min-w-0 space-y-2">
                  {requirement.description
                    ? <p className="text-sm">{requirement.description}</p>
                    : <p className="text-sm text-muted-foreground">This ID is in the plan, but its requirement text isn’t available in the stored analysis.</p>}
                  {requirement.tasks.map((task) => (
                    <div key={task.id} className="space-y-1 text-xs text-muted-foreground">
                      <p><span className="font-mono text-foreground">{task.id}</span> · {task.title}</p>
                      <p className="break-words">Files: {task.paths.map((path) => <code key={path} className="mr-2 rounded bg-muted px-1 py-0.5">{path}</code>)}</p>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">No requirement links could be resolved from the stored plan. Check the task IDs against the plan before deciding.</p>
        )}
        {review.unmappedTasks.length > 0 && (
          <div role="alert" className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm">
            <p className="font-medium">Some edits don’t map to a plan task.</p>
            <ul className="mt-1 list-disc pl-5 text-muted-foreground">
              {review.unmappedTasks.map((task) => <li key={task.taskId}><code>{task.taskId}</code> · {task.paths.join(", ")}</li>)}
            </ul>
          </div>
        )}
      </section>

      {review.flags.length > 0 && (
        <ul className="space-y-1 text-sm">
          {review.flags.map((f, i) => (
            <li key={i} className={f.level === "warn" ? "text-amber-600" : "text-muted-foreground"}>
              {f.level === "warn" ? "Check: " : "Note: "}
              {f.message}
            </li>
          ))}
        </ul>
      )}

      <AiReviewBlock workflowId={workflowId} editsHash={review.editsHash} />

      <ReviewDiffControls>
        {review.files.map((file, index) => (
        <details key={file.path} data-review-file className="overflow-hidden rounded-md border border-border" open={index === 0}>
          <summary className="group cursor-pointer list-none bg-muted/60 px-4 py-3 text-sm marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <code className="break-all font-mono">{file.path}</code>
              {file.isNew && <span className="text-xs text-muted-foreground">new file</span>}
              <span className="ml-auto whitespace-nowrap text-xs"><span className="text-green-700 dark:text-green-400">+{file.added}</span>{" "}<span className="text-red-700 dark:text-red-400">−{file.removed}</span></span>
              <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            </span>
            {(file.requirementIds.length > 0 || file.unmappedTaskIds.length > 0) && (
              <span className="mt-2 flex flex-wrap gap-1.5">
                {file.requirementIds.map((id) => <span key={id} className="rounded border border-primary/20 bg-primary/5 px-1.5 py-0.5 font-mono text-[0.7rem] text-primary">{id}</span>)}
                {file.unmappedTaskIds.map((id) => <span key={id} className="rounded border border-amber-500/40 px-1.5 py-0.5 font-mono text-[0.7rem] text-amber-700 dark:text-amber-300">Unmapped: {id}</span>)}
              </span>
            )}
          </summary>
          {file.hunks.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">No net change in this file.</p>
          )}
          {file.hunks.map((h, hi) => (
            <div key={hi} className="border-t">
              <p className="bg-muted/50 px-3 py-1 font-mono text-sm text-muted-foreground">
                @@ -{h.oldStart} +{h.newStart} @@
              </p>
              <pre className="overflow-x-auto font-mono text-sm leading-6">
                {h.lines.map((l, li) => (
                  <span key={li} className={`block whitespace-pre px-3 ${LINE_TONE[l.type]}`}>
                    {`${l.type} ${l.text}`}
                  </span>
                ))}
              </pre>
            </div>
          ))}
          {file.truncated && (
            <p className="border-t px-3 py-1 text-xs text-muted-foreground">
              Long diff: only the first lines are shown.
            </p>
          )}
        </details>
        ))}
      </ReviewDiffControls>

      {decision && (
        <div className="space-y-1 rounded border p-3 text-sm">
          <p>
            <span className="font-medium">
              {decision.decision === "approved" ? "Approved" : "Rejected"}
            </span>{" "}
            by {decision.decidedBy} on {decision.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC
          </p>
          {decision.reason && <p>Reason: {decision.reason}</p>}
          <p className="font-mono text-xs text-muted-foreground">
            edits hash {decision.editsHash.slice(0, 12)}
          </p>
          {editsChanged && (
            <p className="text-amber-600">
              The edits differ from the ones this decision was made on. Treat the decision as void.
            </p>
          )}
        </div>
      )}

      <PullRequestBlock workflowId={workflowId} canCreate={canCreatePullRequest} />

      {canDecide && (
        <div className="space-y-3">
          <form action={approveChangesAction} className="space-y-2">
            <input type="hidden" name="workflowId" value={workflowId} />
            <Button type="submit" disabled={review.blockers.length > 0}>
              Approve changes
            </Button>
            <p className="text-xs text-muted-foreground">
              Records your approval of exactly these edits. It does not write files or create a pull request; that is a separate action.
            </p>
          </form>
          <form action={rejectChangesAction} className="space-y-2">
            <input type="hidden" name="workflowId" value={workflowId} />
            <textarea
              name="reason"
              required
              minLength={3}
              maxLength={500}
              rows={2}
              placeholder="Why are you rejecting these changes?"
              className="w-full rounded border bg-background p-2 text-sm"
            />
            <Button type="submit" variant="outline">
              Reject changes
            </Button>
          </form>
        </div>
      )}
    </section>
  );
}
