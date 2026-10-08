import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { workflowEvents, workflows } from "@/lib/db/schema";

export const cancellableWorkflowStatuses = [
	"analyzing",
	"planning",
	"generating",
	"verifying",
	"repairing",
] as const;

export async function isWorkflowCancelled(workflowId: string): Promise<boolean> {
	const [workflow] = await db
		.select({ status: workflows.status })
		.from(workflows)
		.where(eq(workflows.id, workflowId));
	return workflow?.status === "cancelled";
}

export async function cancelWorkflow(workflowId: string, userId: string): Promise<boolean> {
	return db.transaction(async (tx) => {
		const [cancelled] = await tx
			.update(workflows)
			.set({ status: "cancelled", error: null, updatedAt: new Date() })
			.where(and(
				eq(workflows.id, workflowId),
				eq(workflows.createdByUserId, userId),
				inArray(workflows.status, [...cancellableWorkflowStatuses]),
			))
			.returning({ id: workflows.id });
		if (!cancelled) return false;
		await tx.insert(workflowEvents).values({
			workflowId,
			type: "WORKFLOW_CANCELLED",
			actor: `user:${userId}`,
		});
		return true;
	});
}
