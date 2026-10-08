import Link from "next/link";
import { redirect } from "next/navigation";
import { and, count, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { ArrowUpRight, Clock3, Code2, GitBranch, GitFork, FolderCode, Layers3, Plus, Star } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { auth } from "@/auth";
import { CooldownRegistration } from "@/components/cooldown-provider";
import { ProductHeader } from "@/components/product-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from "@/components/ui/card";
import { db } from "@/lib/db";
import { codeChunks, repositories, repositoryFiles, workflows } from "@/lib/db/schema";
import { listOwnedRepos } from "@/lib/github/client";
import { getGitHubAccessToken } from "@/lib/github/access-token";
import { EMBEDDING_MODEL } from "@/lib/repository/embeddings";
import { requireAISetup } from "@/lib/ai/setup-status";
import { importRepositoryAction, restoreLegacyRepositoryAction } from "./actions";

type LocalRepository = {
  id: string;
  defaultBranch: string;
  indexedFiles: number;
  workflowCount: number;
  chunkCount: number;
};

function formatUpdatedAt(value: string | null) {
  if (!value) return "GitHub update date unavailable";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "GitHub update date unavailable";
  const daysAgo = Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
  if (daysAgo === 0) return "Updated today";
  if (daysAgo === 1) return "Updated yesterday";
  if (daysAgo < 30) return `Updated ${daysAgo} days ago`;
  return `Updated ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value))}`;
}

function RepoMetric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-lg border border-border/70 bg-background/70 px-3 py-2.5">
      <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-base font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

export default async function RepositoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/");
  await requireAISetup(session.user.id);
  const accessToken = await getGitHubAccessToken();
  if (!accessToken) redirect("/");
  const { error } = await searchParams;

  let repos: Awaited<ReturnType<typeof listOwnedRepos>> = [];
  let listError: string | null = null;
  try {
    repos = await listOwnedRepos(accessToken);
  } catch (e) {
    listError = e instanceof Error ? e.message : "Could not list repositories";
  }

  const localByGitHubId = new Map<string, LocalRepository>();
  let metricsError: string | null = null;
  try {
    const metricsRepository = alias(repositories, "metrics_repository");
    const indexedFilesQuery = db
      .select({ value: sql<number>`count(*)::int` })
      .from(repositoryFiles)
      .where(eq(repositoryFiles.repositoryId, metricsRepository.id));
    const chunkCountQuery = db
      .select({ value: sql<number>`count(*)::int` })
      .from(codeChunks)
      .innerJoin(repositoryFiles, eq(codeChunks.repositoryFileId, repositoryFiles.id))
      .where(and(
        eq(repositoryFiles.repositoryId, metricsRepository.id),
        eq(codeChunks.embeddingModel, EMBEDDING_MODEL),
        isNotNull(codeChunks.embedding),
      ));
    const [localRepositories, workflowCounts] = await Promise.all([
      db
        .select({
          githubRepoId: metricsRepository.githubRepoId,
          id: metricsRepository.id,
          defaultBranch: metricsRepository.defaultBranch,
          indexedFiles: sql<number>`(${indexedFilesQuery})`,
          chunkCount: sql<number>`(${chunkCountQuery})`,
        })
        .from(metricsRepository)
        .where(eq(metricsRepository.ownerUserId, session.user.id)),
      db
        .select({ repositoryId: workflows.repositoryId, workflowCount: count() })
        .from(workflows)
        .innerJoin(repositories, eq(workflows.repositoryId, repositories.id))
        .where(and(
          eq(repositories.ownerUserId, session.user.id),
          eq(workflows.createdByUserId, session.user.id),
        ))
        .groupBy(workflows.repositoryId),
    ]);
    const workflowCountByLocalId = new Map(
      workflowCounts.map((entry) => [entry.repositoryId, entry.workflowCount]),
    );

    for (const local of localRepositories) {
      localByGitHubId.set(String(local.githubRepoId), {
        ...local,
        workflowCount: workflowCountByLocalId.get(local.id) ?? 0,
      });
    }
  } catch (cause) {
    console.error("Failed to load ForgeAI repository metrics", cause);
    metricsError = "ForgeAI index metrics are unavailable. Check the database connection and server logs.";
  }

  const importedCount = repos.filter((repo) => localByGitHubId.has(String(repo.githubRepoId))).length;
	const legacyRepositories = repos.length
		? await db.select({
			id: repositories.id,
			githubRepoId: repositories.githubRepoId,
			owner: repositories.owner,
		}).from(repositories).where(and(
			isNull(repositories.ownerUserId),
			inArray(repositories.githubRepoId, repos.map((repo) => repo.githubRepoId)),
		))
		: [];
	const restorableByGitHubId = new Map(
		legacyRepositories.map((repository) => [String(repository.githubRepoId), repository]),
	);
  const totalWorkflows = repos.reduce(
    (total, repo) => total + (localByGitHubId.get(String(repo.githubRepoId))?.workflowCount ?? 0),
    0,
  );
  const number = new Intl.NumberFormat("en");

  return (
    <>
      <CooldownRegistration error={error ?? null} occurredAt={null} scope="repository-import" />
      <ProductHeader />
      <main className="mx-auto w-full max-w-7xl space-y-8 px-4 py-7 sm:px-6 sm:py-10">
        <header className="flex flex-col justify-between gap-5 border-b border-border pb-6 sm:flex-row sm:items-end">
          <div className="space-y-2">
            <p className="text-sm font-medium tracking-wide text-primary">WORKSPACE</p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Your repositories</h1>
            <p className="max-w-2xl text-base text-muted-foreground">
              Choose a codebase to explore its index or start an AI-assisted workflow.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-lg border border-border bg-card px-3 py-2">
              <strong className="tabular-nums">{repos.length}</strong> available
            </span>
            <span className="rounded-lg border border-border bg-card px-3 py-2">
              <strong className="tabular-nums">{importedCount}</strong> in ForgeAI
            </span>
            <span className="rounded-lg border border-border bg-card px-3 py-2">
              <strong className="tabular-nums">{totalWorkflows}</strong> workflows
            </span>
          </div>
        </header>

        {(error || listError) && (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {error ?? listError}
          </p>
        )}
        {metricsError && <p className="text-sm text-muted-foreground">{metricsError}</p>}

        {repos.length > 0 ? (
          <ul className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
            {repos.map((repo) => {
              const local = localByGitHubId.get(String(repo.githubRepoId));
              const legacy = restorableByGitHubId.get(String(repo.githubRepoId));
              const canRestore = !local && legacy?.owner.toLowerCase() === repo.owner.toLowerCase();
              return (
                <li key={repo.githubRepoId} className="min-w-0">
                  <Card className="h-full gap-0 border border-border/80 py-0 transition duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
                    <CardHeader className="gap-4 p-5 pb-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                            <Code2 aria-hidden="true" className="size-5" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-xs text-muted-foreground">{repo.owner}</p>
                            <h2 className="truncate text-lg font-semibold tracking-tight">
                              {local ? (
                                <Link href={`/repositories/${local.id}`} className="rounded-sm outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring">
                                  {repo.name}
                                </Link>
                              ) : repo.name}
                            </h2>
                          </div>
                        </div>
                        <Badge variant={repo.isPrivate ? "secondary" : "outline"}>
                          {repo.isPrivate ? "Private" : "Public"}
                        </Badge>
                      </div>
                      <CardDescription className="min-h-10 line-clamp-2 text-sm leading-6">
                        {repo.description || "No description provided by GitHub."}
                      </CardDescription>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                        {repo.language && <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-primary/70" />{repo.language}</span>}
                        <span className="inline-flex items-center gap-1.5"><GitBranch aria-hidden="true" className="size-3.5" />{local?.defaultBranch ?? repo.defaultBranch}</span>
                        <span className="inline-flex items-center gap-1.5"><Clock3 aria-hidden="true" className="size-3.5" />{formatUpdatedAt(repo.updatedAt)}</span>
                      </div>
                    </CardHeader>

                    <CardContent className="grid grid-cols-2 gap-2.5 px-5 pb-5">
                      <RepoMetric icon={Star} label="GitHub stars" value={number.format(repo.stars)} />
                      <RepoMetric icon={GitFork} label="Forks" value={number.format(repo.forks)} />
                      <RepoMetric
                        icon={FolderCode}
                        label="Files indexed"
                        value={local ? number.format(local.indexedFiles) : "Not indexed"}
                      />
                      <RepoMetric
                        icon={Layers3}
                        label="Workflows"
                        value={local ? number.format(local.workflowCount) : "—"}
                      />
                      {local && local.chunkCount > 0 && (
                        <p className="col-span-2 px-1 text-xs text-muted-foreground">
                          {number.format(local.chunkCount)} searchable code chunks
                        </p>
                      )}
                    </CardContent>

                    <CardFooter className="mt-auto justify-between gap-3 border-t border-border/70 bg-muted/30 px-5 py-3">
                      {local ? (
                        <>
                          <span className="text-sm text-muted-foreground">Indexed in ForgeAI</span>
                          <Link href={`/repositories/${local.id}`} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover">
                            Open workspace <ArrowUpRight aria-hidden="true" className="size-4" />
                          </Link>
                        </>
                      ) : canRestore ? (
                        <>
                          <span className="text-sm text-muted-foreground">Previous ForgeAI workspace</span>
                          <form action={restoreLegacyRepositoryAction}>
                            <input type="hidden" name="repositoryId" value={legacy.id} />
                            <Button type="submit" size="sm"><ArrowUpRight aria-hidden="true" />Restore workspace</Button>
                          </form>
                        </>
                      ) : (
                        <>
                          <span className="text-sm text-muted-foreground">Ready to add</span>
                          <form action={importRepositoryAction}>
                            <input type="hidden" name="owner" value={repo.owner} />
                            <input type="hidden" name="name" value={repo.name} />
                            <Button type="submit" size="sm"><Plus aria-hidden="true" />Import & index</Button>
                          </form>
                        </>
                      )}
                    </CardFooter>
                  </Card>
                </li>
              );
            })}
          </ul>
        ) : !listError ? (
          <div className="rounded-xl border border-dashed border-border bg-card/60 px-6 py-14 text-center">
            <Code2 aria-hidden="true" className="mx-auto size-8 text-muted-foreground" />
            <h2 className="mt-3 text-lg font-semibold">No repositories found</h2>
            <p className="mt-1 text-sm text-muted-foreground">Repositories you own on GitHub will appear here.</p>
          </div>
        ) : null}
      </main>
    </>
  );
}
