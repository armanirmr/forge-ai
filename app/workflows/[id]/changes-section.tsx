import { eq } from "drizzle-orm";
import { CodeChangeSchema, type CodeChange } from "@/ai/schemas/code-generation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { codeChanges } from "@/lib/db/schema";
import { trimEditForDisplay } from "@/lib/patch/trim-edit";
import { generateCodeAction } from "./actions";

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

export async function ChangesSection({
  workflowId,
  status,
  error,
}: {
  workflowId: string;
  status: string;
  error: string | null;
}) {
  const [row] = await db.select().from(codeChanges).where(eq(codeChanges.workflowId, workflowId));
  const change = row ? CodeChangeSchema.safeParse(row.result) : null;

  const visible = row || ["plan_approved", "generating"].includes(status);
  if (!visible) return null;
  const canGenerate = status === "plan_approved" && !row;

  const byPath = new Map<string, CodeChange["edits"]>();
  if (change?.success) {
    for (const e of change.data.edits) {
      const list = byPath.get(e.path) ?? [];
      list.push(e);
      byPath.set(e.path, list);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-medium">Generated changes</h2>
        {change?.success && <Badge variant="outline">Not applied, not reviewed</Badge>}
        {status === "generating" && <Badge variant="secondary">generating</Badge>}
      </div>

      {canGenerate && (
        <>
          {error && (
            <div role="alert" className="rounded border border-red-500/50 p-4 text-sm text-red-600">
              <p className="font-medium">Code generation failed. The approved plan is unchanged.</p>
              <p className="mt-1 break-words">{error}</p>
            </div>
          )}
          <form action={generateCodeAction} className="space-y-2">
            <input type="hidden" name="workflowId" value={workflowId} />
            <Button type="submit">Generate code</Button>
            <p className="text-xs text-muted-foreground">
              Sends the approved plan, the full text of the files it modifies and the files they
              import (secret-redacted) to the configured AI provider. Nothing is written to the
              repository.
            </p>
          </form>
        </>
      )}

      {status === "generating" && !row && (
        <p className="text-sm text-muted-foreground">
          Code is being generated. If this stays here after a few minutes, the request was
          interrupted.
        </p>
      )}

      {change && !change.success && (
        <p role="alert" className="rounded border border-red-500/50 p-4 text-sm text-red-600">
          Stored changes no longer match the current schema and were not rendered.
        </p>
      )}

      {change?.success && (
        <div className="space-y-5">
          <p className="text-sm">{change.data.summary}</p>
          <p className="text-xs text-muted-foreground">
            Every edit was checked to apply cleanly to the files as indexed when generated. Only
            changed lines are shown. The code has not been run, tested or reviewed.
          </p>

          {[...byPath.entries()].map(([path, edits]) => (
            <div key={path} className="overflow-hidden rounded border">
              <p className="border-b bg-muted px-3 py-2 font-mono text-xs">
                {path}
                {edits.every((e) => e.search === "") && " (new file)"}
              </p>
              {edits.map((e, i) => {
                const { removed, added } = trimEditForDisplay(e.search, e.replace);
                return (
                  <div key={i} className="border-b last:border-0">
                    <p className="px-3 pt-2 font-mono text-xs text-muted-foreground">{e.taskId}</p>
                    <Lines lines={removed} sign="-" />
                    <Lines lines={added} sign="+" />
                  </div>
                );
              })}
            </div>
          ))}

          {change.data.notes.length > 0 && (
            <div className="space-y-1">
              <h3 className="text-sm font-medium">Notes from the generator</h3>
              <ul className="list-disc space-y-0.5 pl-5 text-sm">
                {change.data.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}