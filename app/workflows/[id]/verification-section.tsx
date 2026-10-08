import { desc, eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { AsyncSubmitButton } from "@/components/async-submit-button";
import { db } from "@/lib/db";
import { codeChanges, verificationRuns } from "@/lib/db/schema";
import { isVerificationStale, VerificationResultSchema } from "@/lib/verify/types";
import { verifyChangesAction } from "./actions";

const LABEL = {
  passed: "Passed (scripts exited 0)",
  failed: "Failed",
  error: "Could not run",
  not_executed: "Not executed",
} as const;

export async function VerificationSection({
  workflowId,
  status,
  updatedAt,
}: {
  workflowId: string;
  status: string;
  updatedAt: Date;
}) {
  const [change] = await db
    .select({ id: codeChanges.id })
    .from(codeChanges)
    .where(eq(codeChanges.workflowId, workflowId));
  if (!change) return null;

  const runs = await db
    .select()
    .from(verificationRuns)
    .where(eq(verificationRuns.workflowId, workflowId))
    .orderBy(desc(verificationRuns.createdAt))
    .limit(5);
  const latest = runs[0] ? VerificationResultSchema.safeParse(runs[0].result) : null;

  const stale = status === "verifying" && isVerificationStale(updatedAt);
  const canVerify = status === "changes_generated" || stale;

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-medium">Verification</h2>
        {status === "verifying" && !stale && <Badge variant="info">running</Badge>}
        {latest?.success && (
            <Badge variant={latest.data.status === "passed" ? "success" : "destructive"}>
            {LABEL[latest.data.status]}
          </Badge>
        )}
      </div>

      {canVerify && (
        <form action={verifyChangesAction} className="space-y-2">
          <input type="hidden" name="workflowId" value={workflowId} />
          <AsyncSubmitButton
            pendingLabel="Verifying…"
            pendingMessage="Docker verification is running. This can take a few minutes; the page will update when it finishes."
          >
            {runs.length > 0 ? "Verify again" : "Verify changes"}
          </AsyncSubmitButton>
          <p className="text-xs text-muted-foreground">
            Rebuilds the repository from the indexed files, applies the generated edits and runs the
            repository&apos;s own scripts in an isolated Docker container (no network during checks).
            Nothing is written to the repository. This can take a few minutes.
          </p>
        </form>
      )}

      {status === "verifying" && !stale && (
        <p className="text-sm text-muted-foreground">
          Verification is running. If this stays here, the request was interrupted and the button
          returns after 15 minutes.
        </p>
      )}

      {runs[0] && latest && !latest.success && (
        <p role="alert" className="rounded border border-red-500/50 p-4 text-sm text-red-600">
          The stored result no longer matches the current schema and was not rendered.
        </p>
      )}

      {latest?.success && (
        <div className="space-y-4">
          {latest.data.message && (
            <p className="rounded border p-3 text-sm break-words">{latest.data.message}</p>
          )}
          <p className="text-xs text-muted-foreground">
            These are the real exit codes and output of the commands that ran. &quot;Passed&quot; means
            the repository&apos;s own scripts exited 0. It does not mean the change is correct or has
            been reviewed. Individual test counts are not parsed yet.
          </p>

          {latest.data.steps.map((s) => (
            <details key={s.name} className="rounded border">
              <summary className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                <span className="font-mono">{s.name}</span>
                <Badge variant={s.exitCode === 0 && !s.timedOut ? "secondary" : "destructive"}>
                  {s.timedOut ? "timed out" : s.exitCode === null ? "no exit code" : `exit ${s.exitCode}`}
                </Badge>
                <span className="text-xs text-muted-foreground">{s.durationMs} ms</span>
                <span className="truncate font-mono text-xs text-muted-foreground">{s.command}</span>
              </summary>
              <pre className="max-h-96 overflow-auto border-t bg-muted p-3 font-mono text-xs">
                {s.output || "(no output)"}
              </pre>
            </details>
          ))}

          {latest.data.skipped.length > 0 && (
            <div className="space-y-1">
              <h3 className="text-sm font-medium">Not executed</h3>
              <ul className="list-disc space-y-0.5 pl-5 text-sm">
                {latest.data.skipped.map((s) => (
                  <li key={s.name}>
                    <span className="font-mono">{s.name}</span>: {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {latest.data.notes.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
              {latest.data.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}

          {!latest.data.cleanupOk && (
            <p className="text-xs text-red-600">
              The sandbox container could not be removed. Run <code>docker ps -a</code> and remove any
              <code> changeweft-verify-*</code> container.
            </p>
          )}
        </div>
      )}

      {runs.length > 1 && (
        <p className="text-xs text-muted-foreground">
          {runs.length - 1} earlier run{runs.length > 2 ? "s" : ""} not shown. Statuses:{" "}
          {runs.slice(1).map((r) => r.status).join(", ")}.
        </p>
      )}
    </section>
  );
}
