"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { importRepository } from "@/lib/repository/ingest";
import { getGitHubAccessToken } from "@/lib/github/access-token";
import { db } from "@/lib/db";
import { repositories } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAISetup } from "@/lib/ai/setup-status";

const Input = z.object({
	owner: z.string().regex(/^[A-Za-z0-9_.-]+$/),
	name: z.string().regex(/^[A-Za-z0-9_.-]+$/),
});

export async function importRepositoryAction(formData: FormData) {
	const session = await auth();
	if (!session) redirect("/");
	await requireAISetup(session.user.id);
	const token = await getGitHubAccessToken();
	if (!token) redirect("/");

	const parsed = Input.safeParse({
		owner: formData.get("owner"),
		name: formData.get("name"),
	});
	if (!parsed.success) redirect("/repositories?error=Invalid+repository");

	let repositoryId: string;
	try {
		const result = await importRepository(
			token,
			parsed.data.owner,
			parsed.data.name,
			session.user.id,
		);
		repositoryId = result.repositoryId;
	} catch (err) {
		const message = err instanceof Error ? err.message : "Import failed";
		redirect(`/repositories?error=${encodeURIComponent(message)}`);
	}
	redirect(`/repositories/${repositoryId}`);
}

export async function reindexRepositoryAction(formData: FormData) {
	const session = await auth();
	if (!session) redirect("/");
	await requireAISetup(session.user.id);
	const token = await getGitHubAccessToken();
	if (!token) redirect("/");
	const repositoryId = z.string().uuid().safeParse(formData.get("repositoryId"));
	if (!repositoryId.success) redirect("/repositories");
	const [repo] = await db.select({ owner: repositories.owner, name: repositories.name })
		.from(repositories).where(eq(repositories.id, repositoryId.data));
	if (!repo) redirect("/repositories");
	try {
		await importRepository(token, repo.owner, repo.name, session.user.id);
	} catch (err) {
		const message = err instanceof Error ? err.message : "Re-index failed";
		redirect(`/repositories/${repositoryId.data}?error=${encodeURIComponent(message)}`);
	}
	redirect(`/repositories/${repositoryId.data}?reindexed=1`);
}

export async function searchRepositoryAction(formData: FormData) {
	const session = await auth();
	if (!session) redirect("/");
	await requireAISetup(session.user.id);
	const repositoryId = z.string().uuid().safeParse(formData.get("repositoryId"));
	const query = z.string().trim().min(3).max(500).safeParse(formData.get("query"));
	if (!repositoryId.success || !query.success) redirect("/repositories");
	redirect(`/repositories/${repositoryId.data}?q=${encodeURIComponent(query.data)}`);
}
