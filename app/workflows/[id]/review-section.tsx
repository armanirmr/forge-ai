import { eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { changeApprovals } from "@/lib/db/schema";
import { loadReview } from "@/lib/workflows/review-changes";
import { approveChangesAction, rejectChangesAction } from "./actions";
import { AiReviewBlock } from "./ai-review-block";
import { PullRequestBlock } from "./pull-request-block";
import { auth } from "@/auth";

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
    review.latestRun?.status === "passed" && review.verificationCurrent;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-medium">Review</h2>
        {decision?.decision === "approved" && <Badge variant="success">approved</Badge>}
        {decision?.decision === "rejected" && <Badge variant="destructive">rejected</Badge>}
        {!decision && <Badge variant="outline">awaiting decision</Badge>}
      </div>

      <p className="text-xs text-muted-foreground">
        This is the final result of the generated edits plus {review.repairCount} accepted repair
        {review.repairCount === 1 ? "" : "s"} ({review.editCount} edits), compared with the indexed
        original. Nothing has been written to the repository. A passing verification only means the
        repository scripts exited 0.
      </p>

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

      {review.files.map((file) => (
        <details key={file.path} className="overflow-hidden rounded border">
          <summary className="cursor-pointer bg-muted px-4 py-3 font-mono text-sm">
            {file.path}{" "}
            {file.isNew && <span className="text-muted-foreground">(new file) </span>}
            <span className="text-green-700 dark:text-green-400">+{file.added}</span>{" "}
            <span className="text-red-700 dark:text-red-400">-{file.removed}</span>
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
          {review.blockers.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-amber-600">
              {review.blockers.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}
          <form action={approveChangesAction} className="space-y-2">
            <input type="hidden" name="workflowId" value={workflowId} />
            <Button type="submit" disabled={review.blockers.length > 0}>
              Approve changes
            </Button>
            <p className="text-xs text-muted-foreground">
              Records your approval of exactly these edits. It does not apply them anywhere.
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
