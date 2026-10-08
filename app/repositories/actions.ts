"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { importRepository } from "@/lib/repository/ingest";
import { getGitHubAccessToken } from "@/lib/github/access-token";
import { githubClient } from "@/lib/github/client";
import { db } from "@/lib/db";
import { repositories, workflows } from "@/lib/db/schema";
import { requireAISetup } from "@/lib/ai/setup-status";
import { getOwnedRepository } from "@/lib/security/tenant-access";

const Input = z.object({
	owner: z.string().regex(/^[A-Za-z0-9_.-]+$/),
	name: z.string().regex(/^[A-Za-z0-9_.-]+$/),
});

async function verifyPersonalRepositoryOwner(
	token: string,
	repository: { githubRepoId: number; owner: string; name: string },
	sessionDisplayName?: string | null,
) {
	const octokit = githubClient(token);
	const [{ data: viewer }, { data: githubRepo }] = await Promise.all([
		octokit.rest.users.getAuthenticated(),
		octokit.rest.repos.get({ owner: repository.owner, repo: repository.name }),
	]);
	if (githubRepo.id !== repository.githubRepoId) {
		throw new Error("GitHub reports a different repository ID. Import it as a new workspace.");
	}
	if (
		githubRepo.owner.type !== "User" ||
		githubRepo.owner.id !== viewer.id ||
		githubRepo.owner.login.toLowerCase() !== viewer.login.toLowerCase() ||
		githubRepo.owner.login.toLowerCase() !== repository.owner.toLowerCase()
	) {
		throw new Error("GitHub did not confirm this personal repository as yours.");
	}
	return [...new Set([viewer.login, viewer.name, repository.owner, sessionDisplayName]
		.filter((label): label is string => Boolean(label?.trim()))
		.map((label) => label.trim()))];
}

async function recoverWorkflowCreators(repositoryId: string, userId: string, legacyLabels: string[]) {
	const recovered = await db.update(workflows)
		.set({ createdByUserId: userId })
		.where(and(
			eq(workflows.repositoryId, repositoryId),
			inArray(workflows.createdByUserId, legacyLabels),
		))
		.returning({ id: workflows.id });
	return recovered.length;
}

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

export async function restoreLegacyRepositoryAction(formData: FormData) {
	const session = await auth();
	if (!session) redirect("/");
	const token = await getGitHubAccessToken();
	if (!token) redirect("/");
	const repositoryId = z.string().uuid().safeParse(formData.get("repositoryId"));
	if (!repositoryId.success) redirect("/repositories");

	const [legacy] = await db.select({
		id: repositories.id,
		githubRepoId: repositories.githubRepoId,
		owner: repositories.owner,
		name: repositories.name,
	}).from(repositories).where(and(
		eq(repositories.id, repositoryId.data),
		isNull(repositories.ownerUserId),
	));
	if (!legacy) redirect("/repositories");

	let legacyLabels: string[];
	try {
		legacyLabels = await verifyPersonalRepositoryOwner(token, legacy, session.user.name);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Could not verify the GitHub repository owner";
		redirect(`/repositories?error=${encodeURIComponent(message)}`);
	}

	const [claimed] = await db.update(repositories)
		.set({ ownerUserId: session.user.id, updatedAt: new Date() })
		.where(and(
			eq(repositories.id, legacy.id),
			isNull(repositories.ownerUserId),
		))
		.returning({ id: repositories.id });
	if (!claimed) redirect("/repositories?error=This+workspace+was+already+restored");
	const recovered = await recoverWorkflowCreators(claimed.id, session.user.id, legacyLabels);
	redirect(`/repositories/${claimed.id}?restored=1&recovered=${recovered}`);
}

export async function recoverLegacyWorkflowsAction(formData: FormData) {
	const session = await auth();
	if (!session) redirect("/");
	const token = await getGitHubAccessToken();
	if (!token) redirect("/");
	const repositoryId = z.string().uuid().safeParse(formData.get("repositoryId"));
	if (!repositoryId.success) redirect("/repositories");
	const repository = await getOwnedRepository(repositoryId.data, session.user.id);
	if (!repository) redirect("/repositories");

	let legacyLabels: string[];
	try {
		legacyLabels = await verifyPersonalRepositoryOwner(token, repository, session.user.name);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Could not verify the GitHub repository owner";
		redirect(`/repositories/${repositoryId.data}?error=${encodeURIComponent(message)}`);
	}
	const recovered = await recoverWorkflowCreators(repository.id, session.user.id, legacyLabels);
	if (recovered === 0) {
		redirect(`/repositories/${repository.id}?error=No+workflows+matched+your+verified+GitHub+profile`);
	}
	redirect(`/repositories/${repository.id}?recovered=${recovered}`);
}

export async function reindexRepositoryAction(formData: FormData) {
	const session = await auth();
	if (!session) redirect("/");
	await requireAISetup(session.user.id);
	const token = await getGitHubAccessToken();
	if (!token) redirect("/");
	const repositoryId = z.string().uuid().safeParse(formData.get("repositoryId"));
	if (!repositoryId.success) redirect("/repositories");
	const repo = await getOwnedRepository(repositoryId.data, session.user.id);
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
	const repository = await getOwnedRepository(repositoryId.data, session.user.id);
	if (!repository) redirect("/repositories");
	redirect(`/repositories/${repositoryId.data}?q=${encodeURIComponent(query.data)}`);
}
