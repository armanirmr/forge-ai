import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { repositories, workflows } from "@/lib/db/schema";

export function getOwnedWorkflowScope(userId: string) {
	return and(
		eq(repositories.ownerUserId, userId),
		eq(workflows.createdByUserId, userId),
	);
}

export async function getOwnedRepository(repositoryId: string, userId: string) {
	const [repository] = await db
		.select()
		.from(repositories)
		.where(and(
			eq(repositories.id, repositoryId),
			eq(repositories.ownerUserId, userId),
		));
	return repository ?? null;
}

export async function getOwnedWorkflow(workflowId: string, userId: string) {
	const [row] = await db
		.select({ workflow: workflows, repository: repositories })
		.from(workflows)
		.innerJoin(repositories, eq(workflows.repositoryId, repositories.id))
		.where(and(
			eq(workflows.id, workflowId),
			eq(repositories.ownerUserId, userId),
			eq(workflows.createdByUserId, userId),
		));
	return row ?? null;
}
