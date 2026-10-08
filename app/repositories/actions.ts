"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { importRepository } from "@/lib/repository/ingest";
import { getGitHubAccessToken } from "@/lib/github/access-token";
import { db } from "@/lib/db";
import { repositories, userAISettings, workflowEvents, workflows } from "@/lib/db/schema";
import { requireAISetup } from "@/lib/ai/setup-status";
import { getOwnedRepository } from "@/lib/security/tenant-access";
import { verifyPersonalRepositoryOwner } from "@/lib/security/verified-github-repository";
import { recoverLegacyWorkflowCreators } from "@/lib/security/legacy-workflow-recovery";
import { decryptUserCredential, encryptUserCredential } from "@/lib/security/user-credentials";

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
		ownerUserId: repositories.ownerUserId,
	}).from(repositories).where(eq(repositories.id, repositoryId.data));
	if (!legacy) redirect("/repositories");

	try {
		await verifyPersonalRepositoryOwner(token, legacy, session.user.name);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Could not verify the GitHub repository owner";
		redirect(`/repositories?error=${encodeURIComponent(message)}`);
	}

	const previousOwnerScope = legacy.ownerUserId === null
		? isNull(repositories.ownerUserId)
		: eq(repositories.ownerUserId, legacy.ownerUserId);
	const restored = await db.transaction(async (tx) => {
		const [alreadyOwned] = await tx.select({ id: repositories.id })
			.from(repositories)
			.where(and(
				eq(repositories.githubRepoId, legacy.githubRepoId),
				eq(repositories.ownerUserId, session.user.id),
			));
		if (alreadyOwned) return null;

		const [claimed] = await tx.update(repositories)
			.set({ ownerUserId: session.user.id, updatedAt: new Date() })
			.where(and(eq(repositories.id, legacy.id), previousOwnerScope))
			.returning({ id: repositories.id });
		if (!claimed) return null;

		let settingsRecovery: "none" | "migrated" | "needs_reentry" = "none";
		if (legacy.ownerUserId && legacy.ownerUserId !== session.user.id) {
			const [previousSettings] = await tx.select().from(userAISettings)
				.where(eq(userAISettings.userId, legacy.ownerUserId));
			if (previousSettings) {
				const [currentSettings] = await tx.select({ userId: userAISettings.userId })
					.from(userAISettings)
					.where(eq(userAISettings.userId, session.user.id));
				if (!currentSettings) {
					let encryptedApiKey: string | null = null;
					let encryptedEmbeddingApiKey: string | null = null;
					try {
						encryptedApiKey = encryptUserCredential(
							session.user.id,
							decryptUserCredential(legacy.ownerUserId, previousSettings.encryptedApiKey),
						);
						encryptedEmbeddingApiKey = previousSettings.encryptedEmbeddingApiKey
							? encryptUserCredential(
								session.user.id,
								decryptUserCredential(legacy.ownerUserId, previousSettings.encryptedEmbeddingApiKey),
							)
							: null;
					} catch {
						settingsRecovery = "needs_reentry";
					}
					if (encryptedApiKey !== null) {
						await tx.insert(userAISettings).values({
							userId: session.user.id,
							provider: previousSettings.provider,
							model: previousSettings.model,
							encryptedApiKey,
							encryptedEmbeddingApiKey,
							updatedAt: new Date(),
						}).onConflictDoNothing();
						settingsRecovery = "migrated";
					}
				}
			}
		}

		const recoveredWorkflows = await tx.update(workflows)
			.set({ createdByUserId: session.user.id })
			.where(eq(workflows.repositoryId, claimed.id))
			.returning({ id: workflows.id });
		if (recoveredWorkflows.length > 0) {
			await tx.insert(workflowEvents).values(recoveredWorkflows.map(({ id }) => ({
				workflowId: id,
				type: "WORKFLOW_OWNERSHIP_RECOVERED",
				actor: `user:${session.user.id}`,
				metadata: { repositoryId: claimed.id },
			})));
		}
		return { id: claimed.id, count: recoveredWorkflows.length, settingsRecovery };
	});
	if (!restored) redirect("/repositories?error=This+workspace+was+already+restored");
	if (restored.settingsRecovery === "needs_reentry") redirect("/settings?setup=1&accountRecovery=1");
	redirect(`/repositories/${restored.id}?restored=1&recovered=${restored.count}`);
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
	const recovered = await recoverLegacyWorkflowCreators(repository.id, session.user.id, legacyLabels);
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
