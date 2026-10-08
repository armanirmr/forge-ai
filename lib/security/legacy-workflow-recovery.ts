import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { workflows } from "@/lib/db/schema";

export async function recoverLegacyWorkflowCreators(
	repositoryId: string,
	userId: string,
	verifiedLabels: string[],
) {
	const recovered = await db.update(workflows)
		.set({ createdByUserId: userId })
		.where(and(
			eq(workflows.repositoryId, repositoryId),
			inArray(workflows.createdByUserId, verifiedLabels),
		))
		.returning({ id: workflows.id });
	return recovered.length;
}
