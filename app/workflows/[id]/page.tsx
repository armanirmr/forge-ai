import Link from "next/link";
import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { RequirementAnalysisSchema } from "@/ai/schemas/requirement-analysis";
import { Badge } from "@/components/ui/badge";
import { ProductHeader } from "@/components/product-header";
import { CooldownRegistration } from "@/components/cooldown-provider";
import { db } from "@/lib/db";
import {
  aiRuns,
  pullRequests,
  repositories,
  requirementAnalyses,
  workflowEvents,
  workflows,
} from "@/lib/db/schema";
import { RetrievedContextMetaSchema } from "@/lib/workflows/types";
import { WorkflowProgress } from "./workflow-progress";
import { PlanSection } from "./plan-section";
import { ChangesSection } from "./changes-section";
import { VerificationSection } from "./verification-section";
import { RepairSection } from "./repair-section";
import { ReviewSection } from "./review-section";

function HistoryDetails({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return <details className="history-details" open={open}><summary>{title}</summary><div className="history-details-content">{children}</div></details>;
}

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
  const [pullRequest] = await db
    .select({ status: pullRequests.status, pullNumber: pullRequests.pullNumber, updatedAt: pullRequests.updatedAt })
    .from(pullRequests)
    .where(eq(pullRequests.workflowId, id));
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
    <div className="relative isolate min-h-screen">
    <div className="workflow-atmosphere" aria-hidden="true" />
    <CooldownRegistration error={wf.error} occurredAt={wf.updatedAt} scope={`workflow:${wf.id}`} />
    <div className="relative z-10">
    <ProductHeader />
    <main className="mx-auto w-full max-w-5xl space-y-8 px-5 py-8 sm:px-8 sm:py-10">
      <header className="space-y-6">
        <Link
          href={`/repositories/${wf.repositoryId}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Repositories / {repo ? `${repo.owner}/${repo.name}` : "Repository"}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Change request</h1>
          <Badge variant={
            wf.status === "failed" || wf.status === "changes_rejected" || pullRequest?.status === "failed"
              ? "destructive"
              : pullRequest?.status === "created" || wf.status === "changes_approved"
                ? "success"
                : pullRequest?.status === "creating" || ["analyzing", "analysis_completed", "planning", "plan_completed", "plan_approved", "generating", "changes_generated", "verifying", "repairing"].includes(wf.status)
                  ? "info"
                  : "secondary"
          }>
            {pullRequest?.status === "created" ? "Pull request created" :
              pullRequest?.status === "creating" ? "Creating pull request" :
              pullRequest?.status === "failed" ? "Pull request failed" :
              wf.status === "analysis_completed" ? "Analysis ready" :
              wf.status === "plan_completed" ? "Plan ready for review" :
              wf.status === "plan_approved" ? "Plan approved" :
              wf.status === "changes_generated" ? "Changes ready" :
              wf.status === "changes_approved" ? "Changes approved" :
              wf.status === "changes_rejected" ? "Changes rejected" :
              wf.status === "failed" ? "Failed" :
              wf.status === "analyzing" ? "Analyzing" :
              wf.status === "planning" ? "Planning" :
              wf.status === "generating" ? "Generating changes" :
              wf.status === "verifying" ? "Verifying" :
              wf.status === "repairing" ? "Repairing" : "In progress"}
          </Badge>
        </div>
        <div className="space-y-2 rounded-md border border-border bg-card px-5 py-4 sm:px-6">
          <h2 className="text-sm font-semibold text-primary">Requirement</h2>
          <p className="max-w-4xl text-base leading-7 text-foreground">{wf.requirement}</p>
        </div>
      </header>

      <WorkflowProgress
        status={wf.status}
        pullRequestStatus={pullRequest?.status}
        pullRequestNumber={pullRequest?.pullNumber}
        startedAt={(pullRequest?.status === "creating"
          ? pullRequest.updatedAt
          : wf.status === "analyzing"
            ? wf.createdAt
            : wf.updatedAt).toISOString()}
      />

      {wf.status === "failed" && (
        <div role="alert" className="rounded border border-destructive/50 p-4 text-sm text-destructive">
          <p className="font-medium">Analysis failed. Nothing was saved as a result.</p>
          <p className="mt-1 break-words">{wf.error}</p>
        </div>
      )}

      {analysis && !analysis.success && (
        <p role="alert" className="rounded border border-destructive/50 p-4 text-sm text-destructive">
          Stored analysis no longer matches the current schema and was not rendered.
        </p>
      )}

      {analysis?.success && (
        <section className="space-y-2 border-b border-border pb-6">
          <h2 className="text-xl font-semibold tracking-tight">Analysis summary</h2>
          <p className="text-base leading-7">{analysis.data.summary}</p>
        </section>
      )}
      {analysis?.success && (
        <HistoryDetails title="Full requirement analysis">
        <div className="space-y-6">
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
        </HistoryDetails>
      )}

      {wf.status === "analysis_completed" || wf.status === "planning" || wf.status === "plan_completed" ? (
        <PlanSection workflowId={wf.id} status={wf.status} error={wf.error} />
      ) : ["plan_approved", "generating", "changes_generated", "verifying", "repairing", "changes_approved", "changes_rejected"].includes(wf.status) ? (
        <HistoryDetails title="Implementation plan"><PlanSection workflowId={wf.id} status={wf.status} error={wf.error} /></HistoryDetails>
      ) : null}
      {wf.status === "plan_approved" || wf.status === "generating" ? (
        <ChangesSection workflowId={wf.id} status={wf.status} error={wf.error} />
      ) : ["changes_generated", "verifying", "repairing", "changes_approved", "changes_rejected"].includes(wf.status) ? (
        <HistoryDetails title="Generated changes"><ChangesSection workflowId={wf.id} status={wf.status} error={wf.error} /></HistoryDetails>
      ) : null}
      {wf.status === "changes_generated" || wf.status === "verifying" ? (
        <VerificationSection workflowId={wf.id} status={wf.status} updatedAt={wf.updatedAt} />
      ) : ["repairing", "changes_approved", "changes_rejected"].includes(wf.status) ? (
        <HistoryDetails title="Verification results"><VerificationSection workflowId={wf.id} status={wf.status} updatedAt={wf.updatedAt} /></HistoryDetails>
      ) : null}
      {wf.status === "repairing" ? (
        <RepairSection workflowId={wf.id} status={wf.status} updatedAt={wf.updatedAt} error={wf.error} />
      ) : ["changes_generated", "changes_approved", "changes_rejected"].includes(wf.status) ? (
        <HistoryDetails title="Repair attempts"><RepairSection workflowId={wf.id} status={wf.status} updatedAt={wf.updatedAt} error={wf.error} /></HistoryDetails>
      ) : null}
      {wf.status === "changes_generated" ? (
        <ReviewSection workflowId={wf.id} repositoryId={wf.repositoryId} status={wf.status} />
      ) : ["changes_approved", "changes_rejected"].includes(wf.status) ? (
        <HistoryDetails title="Change review and decision"><ReviewSection workflowId={wf.id} repositoryId={wf.repositoryId} status={wf.status} /></HistoryDetails>
      ) : null}

      {context?.success && (
        <HistoryDetails title="Repository context used">
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
        </HistoryDetails>
      )}

      <HistoryDetails title={`AI activity (${runs.length} runs)`}>
      <section className="space-y-3">
        <h2 className="text-lg font-medium">AI activity</h2>
        <ul className="divide-y rounded border text-sm">
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
      </HistoryDetails>

      <HistoryDetails title={`Timeline (${events.length} events)`}>
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Timeline</h2>
        <ol className="space-y-2 text-sm">
          {events.map((e) => (
            <li key={e.id} className="flex gap-3">
              <time className="text-muted-foreground">{e.createdAt.toLocaleTimeString()}</time>
              <span className="font-mono">{e.type}</span>
              <span className="text-muted-foreground">{e.actor}</span>
            </li>
          ))}
        </ol>
      </section>
      </HistoryDetails>
    </main>
    </div>
    </div>
  );
}
