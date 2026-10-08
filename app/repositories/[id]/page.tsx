import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { count, desc, eq, isNotNull, and } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { codeChunks, repositories, repositoryFiles, workflows } from "@/lib/db/schema";
import { createRequirementAction } from "./actions";
import { reindexRepositoryAction, searchRepositoryAction } from "../actions";
import { EMBEDDING_MODEL } from "@/lib/repository/embeddings";
import { retrieveContext } from "@/lib/repository/retrieve";

export default async function RepositoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; q?: string; reindexed?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/");

  const { id } = await params;
  const { error, q, reindexed } = await searchParams;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const [repo] = await db.select().from(repositories).where(eq(repositories.id, id));
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
      searchResults = await retrieveContext(id, q.trim(), { limit: 8 });
    } catch (err) {
      searchError = err instanceof Error ? err.message : "Code search failed";
    }
  }

  const recent = await db
    .select({
      id: workflows.id,
      requirement: workflows.requirement,
      status: workflows.status,
      createdAt: workflows.createdAt,
    })
    .from(workflows)
    .where(eq(workflows.repositoryId, id))
    .orderBy(desc(workflows.createdAt))
    .limit(10);

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-8">
      <div className="space-y-2">
        <Link href="/repositories" className="text-sm underline">
          ← Repositories
        </Link>
        <h1 className="text-2xl font-semibold">
          {repo.owner}/{repo.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Branch {repo.defaultBranch} · {files.length} files · {chunks} chunks · {embeddedChunks} semantically indexed
        </p>
        {embeddedChunks < chunks && (
          <form action={reindexRepositoryAction}>
            <input type="hidden" name="repositoryId" value={repo.id} />
            <Button type="submit" variant="outline" size="sm">Re-index repository for semantic search</Button>
          </form>
        )}
        {reindexed && <p role="status" className="text-sm text-green-700">Repository re-indexed for semantic search.</p>}
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Search this codebase</h2>
        <form action={searchRepositoryAction} className="flex gap-2">
          <input type="hidden" name="repositoryId" value={repo.id} />
          <input
            name="query"
            defaultValue={q ?? ""}
            required
            minLength={3}
            maxLength={500}
            placeholder="Ask a code question, e.g. Where is authentication handled?"
            className="min-w-0 flex-1 rounded border bg-background px-3 py-2 text-sm"
          />
          <Button type="submit">Search</Button>
        </form>
        {searchError && <p role="alert" className="text-sm text-red-600">{searchError}</p>}
        {searchResults && (
          <div className="space-y-3">
            {searchResults.snippets.map((snippet) => (
              <details key={`${snippet.path}:${snippet.startLine}`} open className="overflow-hidden rounded border">
                <summary className="cursor-pointer bg-muted px-3 py-2 font-mono text-xs">
                  {snippet.path}:{snippet.startLine}-{snippet.endLine}
                </summary>
                <pre className="overflow-x-auto p-3 text-xs"><code>{snippet.content}</code></pre>
              </details>
            ))}
            {searchResults.snippets.length === 0 && <p className="text-sm text-muted-foreground">No relevant code sections were found.</p>}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">New requirement</h2>
        {error && (
          <p role="alert" className="rounded border border-red-500/50 p-3 text-sm text-red-600">
            {error}
          </p>
        )}
        <form action={createRequirementAction} className="space-y-3">
          <input type="hidden" name="repositoryId" value={repo.id} />
          <textarea
            name="requirement"
            required
            minLength={10}
            maxLength={4000}
            rows={4}
            placeholder="Describe what should be built, in English. Example: Add CSV export to the analytics dashboard."
            className="w-full rounded border bg-background p-3 text-sm"
          />
          <Button type="submit">Analyze requirement</Button>
          <p className="text-xs text-muted-foreground">
            Sends the requirement and selected, secret-redacted code snippets to the configured AI
            provider. This can take up to a minute.
          </p>
        </form>
      </section>

      {recent.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Recent workflows</h2>
          <ul className="divide-y rounded border">
            {recent.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-4 p-3">
                <Link href={`/workflows/${w.id}`} className="truncate text-sm underline">
                  {w.requirement}
                </Link>
                <Badge variant={w.status === "failed" ? "destructive" : "secondary"}>
                  {w.status}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Indexed files</h2>
        <ul className="max-h-[40vh] overflow-auto rounded border font-mono text-sm">
          {files.map((f) => (
            <li key={f.path} className="flex justify-between border-b px-3 py-1.5 last:border-0">
              <span>{f.path}</span>
              <span className="text-muted-foreground">{f.size} B</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
