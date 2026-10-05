import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { count, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { repositories, repositoryFiles, codeChunks } from "@/lib/db/schema";

export default async function RepositoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/");

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const [repo] = await db.select().from(repositories).where(eq(repositories.id, id));
  if (!repo) notFound();

  const files = await db
    .select({ path: repositoryFiles.path, language: repositoryFiles.language, size: repositoryFiles.size })
    .from(repositoryFiles)
    .where(eq(repositoryFiles.repositoryId, id))
    .orderBy(repositoryFiles.path);

  const [{ chunks }] = await db
    .select({ chunks: count() })
    .from(codeChunks)
    .innerJoin(repositoryFiles, eq(codeChunks.repositoryFileId, repositoryFiles.id))
    .where(eq(repositoryFiles.repositoryId, id));

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-8">
      <Link href="/repositories" className="text-sm underline">← Repositories</Link>
      <h1 className="text-2xl font-semibold">{repo.owner}/{repo.name}</h1>
      <p className="text-sm text-muted-foreground">
        Branch {repo.defaultBranch} · {files.length} files · {chunks} chunks indexed
      </p>
      <ul className="max-h-[60vh] overflow-auto rounded border font-mono text-sm">
        {files.map((f) => (
          <li key={f.path} className="flex justify-between border-b px-3 py-1.5 last:border-0">
            <span>{f.path}</span>
            <span className="text-muted-foreground">{f.size} B</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
