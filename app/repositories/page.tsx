import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import { listOwnedRepos } from "@/lib/github/client";
import { importRepositoryAction } from "./actions";

export default async function RepositoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.accessToken) redirect("/");
  const { error } = await searchParams;

  let repos: Awaited<ReturnType<typeof listOwnedRepos>> = [];
  let listError: string | null = null;
  try {
    repos = await listOwnedRepos(session.accessToken);
  } catch (e) {
    listError = e instanceof Error ? e.message : "Could not list repositories";
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Repositories</h1>
        <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
          <Button variant="outline" size="sm" type="submit">Sign out</Button>
        </form>
      </header>

      {(error || listError) && (
        <p role="alert" className="rounded border border-red-500/50 p-3 text-sm text-red-600">
          {error ?? listError}
        </p>
      )}

      <ul className="divide-y rounded border">
        {repos.map((r) => (
          <li key={r.githubRepoId} className="flex items-center justify-between gap-4 p-4">
            <div>
              <p className="font-medium">{r.owner}/{r.name}</p>
              <p className="text-sm text-muted-foreground">
                {r.language ?? "Unknown language"}{r.isPrivate ? " · private" : ""}
              </p>
            </div>
            <form action={importRepositoryAction}>
              <input type="hidden" name="owner" value={r.owner} />
              <input type="hidden" name="name" value={r.name} />
              <Button type="submit" size="sm">Import</Button>
            </form>
          </li>
        ))}
        {repos.length === 0 && !listError && (
          <li className="p-4 text-sm text-muted-foreground">No repositories found.</li>
        )}
      </ul>
    </main>
  );
}