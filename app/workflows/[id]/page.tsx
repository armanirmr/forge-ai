import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { RequirementAnalysisSchema } from "@/ai/schemas/requirement-analysis";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import {
  aiRuns,
  repositories,
  requirementAnalyses,
  workflowEvents,
  workflows,
} from "@/lib/db/schema";
import { RetrievedContextMetaSchema } from "@/lib/workflows/types";

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="space-y-1">
      <h3 className="text-sm font-medium">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">None.</p>
      ) : (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {items.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function WorkflowPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect("/");

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const [wf] = await db.select().from(workflows).where(eq(workflows.id, id));
  if (!wf) notFound();

  const [repo] = await db.select().from(repositories).where(eq(repositories.id, wf.repositoryId));
  const [analysisRow] = await db
    .select()
    .from(requirementAnalyses)
    .where(eq(requirementAnalyses.workflowId, id));
  const runs = await db.select().from(aiRuns).where(eq(aiRuns.workflowId, id)).orderBy(asc(aiRuns.createdAt));
  const events = await db
    .select()
    .from(workflowEvents)
    .where(eq(workflowEvents.workflowId, id))
    .orderBy(asc(workflowEvents.createdAt));

  // Re-validate persisted JSON on read; never render unvalidated data.
  const analysis = analysisRow ? RequirementAnalysisSchema.safeParse(analysisRow.result) : null;
  const context = analysisRow
    ? RetrievedContextMetaSchema.safeParse(analysisRow.retrievedContext)
    : null;

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-8">
      <div className="space-y-2">
        <Link href={`/repositories/${wf.repositoryId}`} className="text-sm underline">
          ← {repo ? `${repo.owner}/${repo.name}` : "Repository"}
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Requirement analysis</h1>
          <Badge variant={wf.status === "failed" ? "destructive" : "secondary"}>{wf.status}</Badge>
        </div>
        <blockquote className="border-l-2 pl-3 text-sm">{wf.requirement}</blockquote>
      </div>

      {wf.status === "failed" && (
        <div role="alert" className="rounded border border-red-500/50 p-4 text-sm text-red-600">
          <p className="font-medium">Analysis failed. Nothing was saved as a result.</p>
          <p className="mt-1 break-words">{wf.error}</p>
        </div>
      )}

      {analysis && !analysis.success && (
        <p role="alert" className="rounded border border-red-500/50 p-4 text-sm text-red-600">
          Stored analysis no longer matches the current schema and was not rendered.
        </p>
      )}

      {analysis?.success && (
        <div className="space-y-6">
          <section className="space-y-1">
            <h2 className="text-lg font-medium">Summary</h2>
            <p className="text-sm">{analysis.data.summary}</p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-medium">Functional requirements</h2>
            <ul className="divide-y rounded border text-sm">
              {analysis.data.functionalRequirements.map((r) => (
                <li key={r.id} className="flex items-start gap-3 p-3">
                  <span className="font-mono text-xs">{r.id}</span>
                  <span className="flex-1">{r.description}</span>
                  <Badge variant="outline">{r.priority}</Badge>
                  <Badge variant="secondary">{r.basis}</Badge>
                </li>
              ))}
            </ul>
          </section>

          <List title="Acceptance criteria" items={analysis.data.acceptanceCriteria} />
          <List title="Non-functional requirements" items={analysis.data.nonFunctionalRequirements} />
          <List title="Constraints" items={analysis.data.constraints} />
          <List title="Assumptions" items={analysis.data.assumptions} />
          <List title="Risks" items={analysis.data.risks} />
          <List title="Open questions" items={analysis.data.openQuestions} />

          <section className="space-y-2">
            <h3 className="text-sm font-medium">Affected files</h3>
            {analysis.data.affectedFiles.length === 0 ? (
              <p className="text-sm text-muted-foreground">None identified.</p>
            ) : (
              <ul className="divide-y rounded border text-sm">
                {analysis.data.affectedFiles.map((f) => (
                  <li key={f.path} className="p-3">
                    <p className="font-mono">{f.path}</p>
                    <p className="text-muted-foreground">{f.reason}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {context?.success && (
        <section className="space-y-2">
          <h2 className="text-lg font-medium">Repository context used</h2>
          <p className="text-sm text-muted-foreground">
            Keywords: {context.data.keywords.join(", ") || "none"} · file tree sent:{" "}
            {context.data.fileTreeShown}/{context.data.fileTreeTotal} · secrets redacted:{" "}
            {context.data.redactions}
          </p>
          <ul className="divide-y rounded border font-mono text-xs">
            {context.data.snippets.map((s, i) => (
              <li key={i} className="flex justify-between p-2">
                <span>
                  {s.path}:{s.startLine}-{s.endLine}
                </span>
                <span className="text-muted-foreground">score {s.score}</span>
              </li>
            ))}
            {context.data.snippets.length === 0 && (
              <li className="p-2 text-muted-foreground">No snippets matched.</li>
            )}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-medium">AI runs</h2>
        <ul className="divide-y rounded border text-xs">
          {runs.map((r) => (
            <li key={r.id} className="grid grid-cols-2 gap-1 p-3 sm:grid-cols-4">
              <span>{r.agent}</span>
              <span className="font-mono">{r.promptVersion}</span>
              <span>{r.model}</span>
              <span>
                {r.status} · {r.durationMs ?? "?"} ms · {r.inputTokens ?? "?"}/{r.outputTokens ?? "?"}{" "}
                tok
              </span>
              {r.error && <span className="col-span-full break-words text-red-600">{r.error}</span>}
            </li>
          ))}
          {runs.length === 0 && <li className="p-3 text-muted-foreground">No AI runs recorded.</li>}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Timeline</h2>
        <ol className="space-y-1 text-xs">
          {events.map((e) => (
            <li key={e.id} className="flex gap-3">
              <time className="text-muted-foreground">{e.createdAt.toLocaleTimeString()}</time>
              <span className="font-mono">{e.type}</span>
              <span className="text-muted-foreground">{e.actor}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}