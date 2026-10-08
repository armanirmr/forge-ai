import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { count, desc, eq, ilike, isNotNull, isNull, and } from "drizzle-orm";
import { ArrowLeft, ArrowUpRight, Braces, ChevronDown, Clock3, FileCode2, GitBranch, Search, Sparkles } from "lucide-react";
import { z } from "zod";
import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { ProductHeader } from "@/components/product-header";
import { WorkflowHistoryFilters } from "@/components/workflow-history-filters";
import { AsyncSubmitButton } from "@/components/async-submit-button";
import { CooldownRegistration } from "@/components/cooldown-provider";
import { db } from "@/lib/db";
import { codeChunks, repositoryFiles, workflows } from "@/lib/db/schema";
import { archiveWorkflowAction, createRequirementAction, restoreWorkflowAction } from "./actions";
import { recoverLegacyWorkflowsAction, reindexRepositoryAction, searchRepositoryAction } from "../actions";
import { EMBEDDING_MODEL } from "@/lib/repository/embeddings";
import { retrieveContext } from "@/lib/repository/retrieve";
import { requireAISetup } from "@/lib/ai/setup-status";
import { getOwnedRepository } from "@/lib/security/tenant-access";
import {
	escapeWorkflowHistorySearch,
	normalizeWorkflowHistorySearch,
	resolveWorkflowHistoryPage,
	workflowHistoryPageCount,
} from "@/lib/workflows/history-pagination";

const WORKFLOW_PAGE_SIZE = 20;
const WORKFLOW_STATUSES = [
	"analyzing",
	"analysis_completed",
	"planning",
	"plan_completed",
	"plan_approved",
	"generating",
	"changes_generated",
	"verifying",
	"repairing",
	"changes_approved",
	"changes_rejected",
	"failed",
].map((value) => ({ value, label: value.replaceAll("_", " ") }));

export default async function RepositoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    q?: string;
    reindexed?: string;
    restored?: string;
    recovered?: string;
    history?: string;
    workflowStatus?: string;
    workflowArchive?: string;
    workflowPage?: string;
  }>;
}) {
  const session = await auth();
  if (!session) redirect("/");
  await requireAISetup(session.user.id);

  const { id } = await params;
  const { error, q, reindexed, restored, recovered, history, workflowStatus, workflowArchive, workflowPage } = await searchParams;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const repo = await getOwnedRepository(id, session.user.id);
  if (!repo) notFound();

  const files = await db
    .select({
      path: repositoryFiles.path,
      language: repositoryFiles.language,
      size: repositoryFiles.size,
    })
    .from(repositoryFiles)
    .where(eq(repositoryFiles.repositoryId, id))
    .orderBy(repositoryFiles.path);

  const [{ chunks }] = await db
    .select({ chunks: count() })
    .from(codeChunks)
    .innerJoin(repositoryFiles, eq(codeChunks.repositoryFileId, repositoryFiles.id))
    .where(eq(repositoryFiles.repositoryId, id));

  const [{ embeddedChunks }] = await db
    .select({ embeddedChunks: count() })
    .from(codeChunks)
    .innerJoin(repositoryFiles, eq(codeChunks.repositoryFileId, repositoryFiles.id))
    .where(and(
      eq(repositoryFiles.repositoryId, id),
      eq(codeChunks.embeddingModel, EMBEDDING_MODEL),
      isNotNull(codeChunks.embedding),
    ));

  let searchResults: Awaited<ReturnType<typeof retrieveContext>> | null = null;
  let searchError: string | null = null;
  if (q?.trim()) {
    try {
		searchResults = await retrieveContext(id, q.trim(), { limit: 8, userId: session.user.id });
    } catch (err) {
      searchError = err instanceof Error ? err.message : "Code search failed";
    }
  }

  const historySearch = normalizeWorkflowHistorySearch(history);
  const allowedStatuses = new Set(WORKFLOW_STATUSES.map((status) => status.value));
  const selectedWorkflowStatus = allowedStatuses.has(workflowStatus ?? "") ? workflowStatus! : "all";
  const selectedArchive = workflowArchive === "archived" ? "archived" : "active";
  const historyConditions = [
    eq(workflows.repositoryId, id),
    eq(workflows.createdByUserId, session.user.id),
    selectedArchive === "archived" ? isNotNull(workflows.archivedAt) : isNull(workflows.archivedAt),
  ];
  if (historySearch) {
    const escapedSearch = escapeWorkflowHistorySearch(historySearch);
    historyConditions.push(ilike(workflows.requirement, `%${escapedSearch}%`));
  }
  if (selectedWorkflowStatus !== "all") {
    historyConditions.push(eq(workflows.status, selectedWorkflowStatus as typeof workflows.$inferSelect.status));
  }
  const historyScope = and(...historyConditions);
  const [{ historyCount }] = await db
    .select({ historyCount: count() })
    .from(workflows)
    .where(historyScope);
  const historyPages = workflowHistoryPageCount(historyCount, WORKFLOW_PAGE_SIZE);
  const historyPage = resolveWorkflowHistoryPage(workflowPage, historyCount, WORKFLOW_PAGE_SIZE);
  const recent = await db
    .select({
      id: workflows.id,
      requirement: workflows.requirement,
      status: workflows.status,
      createdAt: workflows.createdAt,
    })
    .from(workflows)
    .where(historyScope)
    .orderBy(desc(workflows.createdAt))
    .limit(WORKFLOW_PAGE_SIZE)
    .offset((historyPage - 1) * WORKFLOW_PAGE_SIZE);
  const [{ workflowCount }] = await db
    .select({ workflowCount: count() })
    .from(workflows)
    .where(and(eq(workflows.repositoryId, id), eq(workflows.createdByUserId, session.user.id)));
  const [{ allWorkflowCount }] = await db
    .select({ allWorkflowCount: count() })
    .from(workflows)
    .where(eq(workflows.repositoryId, id));

  const historyHref = (page: number) => {
    const query = new URLSearchParams();
    if (historySearch) query.set("history", historySearch);
    if (selectedWorkflowStatus !== "all") query.set("workflowStatus", selectedWorkflowStatus);
    if (selectedArchive !== "active") query.set("workflowArchive", selectedArchive);
    if (page > 1) query.set("workflowPage", String(page));
    if (q) query.set("q", q);
    const search = query.toString();
    return `/repositories/${id}${search ? `?${search}` : ""}#workflow-history`;
  };

  const number = new Intl.NumberFormat("en");
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <>
    <CooldownRegistration error={searchError} occurredAt={null} scope={`repository-search:${id}`} />
    <CooldownRegistration error={error ?? null} occurredAt={null} scope={`repository-action:${id}`} />
    <ProductHeader />
    <main className="mx-auto w-full max-w-7xl space-y-8 px-4 py-7 sm:px-6 sm:py-9">
      <div className="flex items-center justify-between gap-4">
        <Link href="/repositories" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft aria-hidden="true" className="size-4" /> All repositories
        </Link>
        {reindexed && <p role="status" className="text-sm font-medium text-success-muted-foreground">Repository index refreshed.</p>}
        {restored && <p role="status" className="text-sm font-medium text-success-muted-foreground">Workspace restored{recovered ? ` · ${recovered} prior workflows recovered` : ""}.</p>}
        {recovered && !restored && <p role="status" className="text-sm font-medium text-success-muted-foreground">Recovered {recovered} previous workflows.</p>}
      </div>

      <section aria-labelledby="repository-title" className="grid gap-7 rounded-xl bg-foreground p-5 text-background sm:p-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="min-w-0 space-y-5">
          <div className="flex items-center gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-background/10">
              <Braces aria-hidden="true" className="size-6" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm text-background/70">{repo.owner}</p>
              <h1 id="repository-title" className="truncate font-heading text-3xl font-semibold tracking-tight sm:text-4xl">{repo.name}</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-background/75">
            <span className="inline-flex items-center gap-2"><GitBranch aria-hidden="true" className="size-4" />{repo.defaultBranch}</span>
            <span className="inline-flex items-center gap-2"><FileCode2 aria-hidden="true" className="size-4" />{number.format(files.length)} indexed files</span>
            <span>{formatBytes(totalBytes)} of source</span>
          </div>
        </div>

        <dl className="grid grid-cols-3 border-t border-background/20 pt-5 lg:min-w-[22rem] lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
          <div className="space-y-1 pr-3">
            <dt className="text-xs text-background/65">Workflows</dt>
            <dd className="font-heading text-2xl font-semibold tabular-nums">{number.format(workflowCount)}</dd>
          </div>
          <div className="space-y-1 border-l border-background/20 px-3">
            <dt className="text-xs text-background/65">Code chunks</dt>
            <dd className="font-heading text-2xl font-semibold tabular-nums">{number.format(chunks)}</dd>
          </div>
          <div className="space-y-1 border-l border-background/20 pl-3">
            <dt className="text-xs text-background/65">Semantic</dt>
            <dd className="font-heading text-2xl font-semibold tabular-nums">{number.format(embeddedChunks)}</dd>
          </div>
        </dl>
      </section>

      {embeddedChunks < chunks && (
        <div className="flex flex-col justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 sm:flex-row sm:items-center">
          <p className="text-sm text-muted-foreground">Some code chunks aren’t in the semantic index yet. Refresh it to improve code search.</p>
          <form action={reindexRepositoryAction}>
            <input type="hidden" name="repositoryId" value={repo.id} />
            <AsyncSubmitButton variant="outline" size="sm" pendingLabel="Refreshing index…" pendingMessage="Re-indexing repository files for semantic search.">
              Refresh index
            </AsyncSubmitButton>
          </form>
        </div>
      )}

      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.85fr)]">
        <section id="requirement" aria-labelledby="requirement-title" className="space-y-5">
          <div className="space-y-2">
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-primary"><Sparkles aria-hidden="true" className="size-4" /> Start with a change</p>
            <h2 id="requirement-title" className="font-heading text-2xl font-semibold sm:text-3xl">What should this repository do next?</h2>
            <p className="max-w-2xl text-base text-muted-foreground">Describe the outcome. Changeweft will inspect the codebase and turn your request into a reviewable analysis.</p>
          </div>

          {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p>}
          <form action={createRequirementAction} className="space-y-3">
            <input type="hidden" name="repositoryId" value={repo.id} />
            <label htmlFor="requirement-input" className="sr-only">Describe the change you want</label>
            <textarea
              id="requirement-input"
              name="requirement"
              required
              minLength={10}
              maxLength={4000}
              rows={6}
              placeholder="For example: Let analysts export filtered reports as CSV, with region access enforced."
              className="w-full resize-y rounded-xl border border-input bg-card px-4 py-4 text-base leading-7 shadow-sm outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
            />
            <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-lg text-sm leading-6 text-muted-foreground">Selected, secret-redacted code context is sent to your configured AI provider. Your repository files are not changed.</p>
              <AsyncSubmitButton
                size="lg"
                className="h-11 px-4"
                pendingLabel="Analyzing…"
                pendingMessage="Reading the requirement and selected repository context."
              >
                Analyze requirement <ArrowUpRight aria-hidden="true" />
              </AsyncSubmitButton>
            </div>
          </form>
        </section>

        <section aria-labelledby="search-title" className="space-y-5 border-t border-border pt-7 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-muted-foreground">EXPLORE THE INDEX</p>
            <h2 id="search-title" className="font-heading text-2xl font-semibold">Ask the codebase</h2>
            <p className="text-base leading-7 text-muted-foreground">Find relevant files and code sections before writing a requirement.</p>
          </div>
          <form action={searchRepositoryAction} className="space-y-3">
            <input type="hidden" name="repositoryId" value={repo.id} />
            <label htmlFor="repository-query" className="sr-only">Ask a question about this codebase</label>
            <div className="flex min-w-0 items-center gap-2 rounded-xl border border-input bg-card px-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/25">
              <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              <input
                id="repository-query"
                name="query"
                defaultValue={q ?? ""}
                required
                minLength={3}
                maxLength={500}
                placeholder="Where is authentication handled?"
                className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
              />
            </div>
            <AsyncSubmitButton variant="outline" className="h-10 w-full" pendingLabel="Searching…" pendingMessage="Searching indexed files and code sections.">
              Search repository
            </AsyncSubmitButton>
          </form>
          {searchError && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{searchError}</p>}
          {searchResults && (
            <div className="space-y-2" aria-live="polite">
              <p className="text-sm font-medium">{searchResults.snippets.length} matching code sections</p>
              {searchResults.snippets.map((snippet) => (
                <details key={`${snippet.path}:${snippet.startLine}`} className="group overflow-hidden rounded-lg border border-border bg-card">
                  <summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-3 text-sm hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                    <span className="min-w-0 truncate font-mono text-sm">{snippet.path}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">L{snippet.startLine}–{snippet.endLine}</span>
                  </summary>
                  <pre className="max-h-72 overflow-auto border-t border-border bg-muted/40 p-3 text-sm leading-6"><code>{snippet.content}</code></pre>
                </details>
              ))}
              {searchResults.snippets.length === 0 && <p className="rounded-lg border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">No matching code sections. Try a different phrase or refresh the repository index.</p>}
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-10 border-t border-border pt-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.85fr)]">
        <section id="workflow-history" aria-labelledby="recent-work-title" className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div className="space-y-1">
              <h2 id="recent-work-title" className="font-heading text-xl font-semibold">Workflow history</h2>
              <p className="text-sm text-muted-foreground">Find a requirement and check its current status.</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              {allWorkflowCount > workflowCount && <form action={recoverLegacyWorkflowsAction}>
                <input type="hidden" name="repositoryId" value={repo.id} />
                <AsyncSubmitButton variant="outline" size="sm" pendingLabel="Recovering…" pendingMessage="Matching prior workflow records to your verified GitHub profile.">
                  Recover previous workflows
                </AsyncSubmitButton>
              </form>}
            </div>
          </div>
          <WorkflowHistoryFilters
            key={`${historySearch}:${selectedWorkflowStatus}:${selectedArchive}`}
            search={historySearch}
            status={selectedWorkflowStatus}
            archive={selectedArchive}
            codeQuery={q ?? ""}
            statuses={WORKFLOW_STATUSES}
          />
          {recent.length > 0 ? (
            <ul className="divide-y divide-border border-y border-border">
              {recent.map((workflow) => (
                <li key={workflow.id}>
                  <div className="flex items-center gap-3 py-4">
                    <Link href={`/workflows/${workflow.id}`} className="group flex min-w-0 flex-1 items-center justify-between gap-4 outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <span className="min-w-0 space-y-1">
                        <span className="block line-clamp-2 text-base font-medium leading-6 group-hover:text-primary">{workflow.requirement}</span>
                        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"><Clock3 aria-hidden="true" className="size-3.5" />{workflow.createdAt.toLocaleDateString("en", { month: "short", day: "numeric" })}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <Badge variant={workflow.status === "failed" ? "destructive" : workflow.status === "changes_approved" ? "success" : "secondary"}>{workflow.status.replaceAll("_", " ")}</Badge>
                        <ArrowUpRight aria-hidden="true" className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                      </span>
                    </Link>
                    <form action={selectedArchive === "archived" ? restoreWorkflowAction : archiveWorkflowAction}>
                      <input type="hidden" name="repositoryId" value={id} />
                      <input type="hidden" name="workflowId" value={workflow.id} />
                      <button type="submit" className="rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{selectedArchive === "archived" ? "Restore" : "Archive"}</button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          ) : historySearch || selectedWorkflowStatus !== "all" ? (
            <div className="border-y border-dashed border-border py-7">
              <p className="text-base font-medium">No workflows match these filters</p>
              <p className="mt-1 text-sm text-muted-foreground">Try another phrase or choose a different status.</p>
              <Link href={`/repositories/${id}?workflowArchive=${selectedArchive}#workflow-history`} className="mt-3 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline">Clear filters</Link>
            </div>
          ) : selectedArchive === "active" && workflowCount === 0 && allWorkflowCount === 0 ? (
            <div className="border-y border-dashed border-border py-7">
              <p className="text-base font-medium">No workflows yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Your first requirement will start this repository’s workflow history.</p>
              <Link href="#requirement" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline">Start a requirement <ArrowUpRight aria-hidden="true" className="size-4" /></Link>
            </div>
          ) : (
            <div className="border-y border-dashed border-border py-7">
              <p className="text-base font-medium">No {selectedArchive} workflows in this view</p>
              <p className="mt-1 text-sm text-muted-foreground">{selectedArchive === "active" ? "Check archived workflows, or start a new requirement." : "Archived workflows keep their history and can be restored."}</p>
              <Link href={`/repositories/${id}?workflowArchive=${selectedArchive === "active" ? "archived" : "active"}#workflow-history`} className="mt-3 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline">View {selectedArchive === "active" ? "archived" : "active"} workflows</Link>
            </div>
          )}
          {historyCount > 0 && <nav aria-label="Workflow history pages" className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <p className="text-sm tabular-nums text-muted-foreground">Showing {(historyPage - 1) * WORKFLOW_PAGE_SIZE + 1}–{Math.min(historyPage * WORKFLOW_PAGE_SIZE, historyCount)} of {number.format(historyCount)}</p>
            <div className="flex items-center gap-2">
              {historyPage > 1 ? <Link href={historyHref(historyPage - 1)} className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Previous</Link> : <span className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm text-muted-foreground opacity-50">Previous</span>}
              <span aria-current="page" className="px-2 text-sm tabular-nums">{historyPage} / {historyPages}</span>
              {historyPage < historyPages ? <Link href={historyHref(historyPage + 1)} className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Next</Link> : <span className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm text-muted-foreground opacity-50">Next</span>}
            </div>
          </nav>}
        </section>

        <section aria-labelledby="indexed-files-title" className="space-y-4 border-t border-border pt-7 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <div className="space-y-1">
            <h2 id="indexed-files-title" className="font-heading text-xl font-semibold">Repository map</h2>
            <p className="text-sm text-muted-foreground">Files available to Changeweft for retrieval.</p>
          </div>
          <details className="group rounded-lg border border-border bg-card">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
              <span className="inline-flex items-center gap-2 text-sm font-medium"><FileCode2 aria-hidden="true" className="size-4 text-primary" />{number.format(files.length)} indexed files</span>
              <span className="inline-flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
                {formatBytes(totalBytes)}
                <ChevronDown aria-hidden="true" className="size-4 transition-transform motion-reduce:transition-none group-open:rotate-180" />
              </span>
            </summary>
            <ul className="max-h-[24rem] overflow-auto border-t border-border font-mono text-sm">
              {files.map((file) => (
                <li key={file.path} className="flex items-start justify-between gap-4 border-b border-border/70 px-3 py-2.5 last:border-0">
                  <span className="min-w-0 break-all">{file.path}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatBytes(file.size)}</span>
                </li>
              ))}
            </ul>
          </details>
          <p className="text-sm text-muted-foreground">{number.format(embeddedChunks)} of {number.format(chunks)} code chunks have semantic embeddings.</p>
        </section>
      </div>
    </main>
    </>
  );
}
