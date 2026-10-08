import { asc, desc, eq } from "drizzle-orm";
import { RepairSchema } from "@/ai/schemas/repair";
import { Badge } from "@/components/ui/badge";
import { AsyncSubmitButton } from "@/components/async-submit-button";
import { db } from "@/lib/db";
import { repairAttempts, verificationRuns } from "@/lib/db/schema";
import { trimEditForDisplay } from "@/lib/patch/trim-edit";
import { MAX_REPAIR_ATTEMPTS } from "@/lib/repair/constants";
import { isVerificationStale } from "@/lib/verify/types";
import { repairChangesAction } from "./actions";

function Lines({ lines, sign }: { lines: string[]; sign: "+" | "-" }) {
  if (lines.length === 0) return null;
  const tone =
    sign === "+"
      ? "bg-green-500/10 text-green-700 dark:text-green-400"
      : "bg-red-500/10 text-red-700 dark:text-red-400";
  return (
    <pre className={`overflow-x-auto px-3 py-1 font-mono text-xs ${tone}`}>
      {lines.map((line) => `${sign} ${line}`).join("\n")}
    </pre>
  );
}

export async function RepairSection({
  workflowId,
  status,
  updatedAt,
  error,
}: {
  workflowId: string;
  status: string;
  updatedAt: Date;
  error: string | null;
}) {
  const runs = await db
    .select({ id: verificationRuns.id, status: verificationRuns.status })
    .from(verificationRuns)
    .where(eq(verificationRuns.workflowId, workflowId))
    .orderBy(desc(verificationRuns.createdAt));
  const attempts = await db
    .select()
    .from(repairAttempts)
    .where(eq(repairAttempts.workflowId, workflowId))
    .orderBy(asc(repairAttempts.attemptNumber));

  const latest = runs[0];
  const latestFailed = latest?.status === "failed";

  const stale = status === "repairing" && isVerificationStale(updatedAt);
  const canRepair =
    (status === "changes_generated" || stale) && latestFailed && attempts.length < MAX_REPAIR_ATTEMPTS;
  const exhausted =
    status === "changes_generated" && latestFailed && attempts.length >= MAX_REPAIR_ATTEMPTS;
  const statusById = new Map(runs.map((r) => [r.id, r.status]));

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-medium">Repair</h2>
        {status === "repairing" && !stale && <Badge variant="info">repairing</Badge>}
        {exhausted && <Badge variant="destructive">human intervention required</Badge>}
      </div>

      {!latestFailed && attempts.length === 0 && status !== "repairing" && (
        <p className="text-base leading-7 text-muted-foreground">
          {latest?.status === "passed"
            ? "No repair attempts were needed; verification passed."
            : "Run verification to enable a repair if any checks fail."}
        </p>
      )}

      {error && status === "changes_generated" && (
        <p role="alert" className="rounded border border-red-500/50 p-3 text-sm break-words text-red-600">
          {error}
        </p>
      )}

      {canRepair && (
        <form action={repairChangesAction} className="space-y-2">
          <input type="hidden" name="workflowId" value={workflowId} />
          <AsyncSubmitButton
            pendingLabel="Repairing…"
            pendingMessage="The repair request is pending. It may generate and verify several attempts; the page will update when it finishes."
          >
            Repair ({MAX_REPAIR_ATTEMPTS - attempts.length} attempt
            {MAX_REPAIR_ATTEMPTS - attempts.length === 1 ? "" : "s"} left)
          </AsyncSubmitButton>
          <p className="text-xs text-muted-foreground">
            Sends the real failure output and the plan&apos;s current files (secret-redacted) to the
            configured AI provider. Each attempt proposes edits, applies them to the sandbox copy and
            verifies again. It stops on a pass, after {MAX_REPAIR_ATTEMPTS} attempts, or when the
            debugger cannot fix it safely. This can take several minutes. Nothing is written to the
            repository.
          </p>
        </form>
      )}

      {status === "repairing" && !stale && (
        <p className="text-sm text-muted-foreground">
          Repair is running. If this stays here, the request was interrupted and the button returns
          after 15 minutes.
        </p>
      )}

      {attempts.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Repair edits come from the AI and have not been reviewed. Read the diffs, especially in test
          files: the guard rejects skipped or deleted tests but cannot tell whether an expected value was
          loosened.
        </p>
      )}

      {attempts.map((a) => {
        const parsed = a.result ? RepairSchema.safeParse(a.result) : null;
        const after = a.resultRunId ? statusById.get(a.resultRunId) : undefined;
        return (
          <div key={a.id} className="space-y-2 rounded border p-3">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="font-medium">Attempt {a.attemptNumber}</span>
              <Badge variant={a.status === "accepted" ? "secondary" : "destructive"}>{a.status}</Badge>
              {after && (
                <Badge variant={after === "passed" ? "secondary" : "destructive"}>
                  verification afterwards: {after}
                </Badge>
              )}
            </div>

            {a.error && <p className="text-sm break-words text-red-600">{a.error}</p>}

            {parsed && !parsed.success && (
              <p className="text-sm text-red-600">
                The stored attempt no longer matches the current schema and was not rendered.
              </p>
            )}

            {parsed?.success && (
              <div className="space-y-2">
                <p className="text-sm">
                  <span className="font-medium">Root cause: </span>
                  {parsed.data.rootCause}
                </p>
                <p className="text-sm">{parsed.data.summary}</p>
                {parsed.data.cannotFixReason && (
                  <p className="text-sm">
                    <span className="font-medium">Could not fix: </span>
                    {parsed.data.cannotFixReason}
                  </p>
                )}
                {parsed.data.edits.map((e, i) => {
                  const { removed, added } = trimEditForDisplay(e.search, e.replace);
                  return (
                    <div key={i} className="overflow-hidden rounded border">
                      <p className="border-b bg-muted px-3 py-1 font-mono text-xs">
                        {e.path} <span className="text-muted-foreground">{e.taskId}</span>
                      </p>
                      <Lines lines={removed} sign="-" />
                      <Lines lines={added} sign="+" />
                    </div>
                  );
                })}
                {parsed.data.notes.length > 0 && (
                  <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                    {parsed.data.notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
