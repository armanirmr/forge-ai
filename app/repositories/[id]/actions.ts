"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { and, eq, isNull, isNotNull } from "drizzle-orm";
import { auth } from "@/auth";
import { startRequirementAnalysis } from "@/lib/workflows/analyze-requirement";
import { requireAISetup } from "@/lib/ai/setup-status";
import { getOwnedRepository, getOwnedWorkflow } from "@/lib/security/tenant-access";
import { db } from "@/lib/db";
import { workflowEvents, workflows } from "@/lib/db/schema";

const Input = z.object({
	repositoryId: z.string().uuid(),
	requirement: z.string().trim().min(10).max(4000),
});

const WorkflowArchiveInput = z.object({
	repositoryId: z.string().uuid(),
	workflowId: z.string().uuid(),
});

async function setWorkflowArchived(formData: FormData, archived: boolean) {
	const session = await auth();
	if (!session) redirect("/");
	const parsed = WorkflowArchiveInput.safeParse({
		repositoryId: formData.get("repositoryId"),
		workflowId: formData.get("workflowId"),
	});
	if (!parsed.success) redirect("/repositories");

	const userId = session.user.id;
	const owned = await getOwnedWorkflow(parsed.data.workflowId, userId);
	if (!owned || owned.repository.id !== parsed.data.repositoryId) redirect("/repositories");
	if (Boolean(owned.workflow.archivedAt) === archived) {
		redirect(`/repositories/${owned.repository.id}?workflowArchive=${archived ? "archived" : "active"}#workflow-history`);
	}

	const changed = await db.transaction(async (tx) => {
		const [updated] = await tx.update(workflows)
			.set({ archivedAt: archived ? new Date() : null })
			.where(and(
				eq(workflows.id, owned.workflow.id),
				eq(workflows.createdByUserId, userId),
				archived ? isNull(workflows.archivedAt) : isNotNull(workflows.archivedAt),
			))
			.returning({ id: workflows.id });
		if (!updated) return false;

		await tx.insert(workflowEvents).values({
			workflowId: updated.id,
			type: archived ? "WORKFLOW_ARCHIVED" : "WORKFLOW_RESTORED",
			actor: `user:${userId}`,
			metadata: { repositoryId: owned.repository.id },
		});
		return true;
	});

	if (!changed) redirect("/repositories");
	redirect(`/repositories/${owned.repository.id}?workflowArchive=${archived ? "archived" : "active"}#workflow-history`);
}

export async function archiveWorkflowAction(formData: FormData) {
	await setWorkflowArchived(formData, true);
}

export async function restoreWorkflowAction(formData: FormData) {
	await setWorkflowArchived(formData, false);
}

export async function createRequirementAction(formData: FormData) {
	const session = await auth();
	if (!session) redirect("/");
	await requireAISetup(session.user.id);

	const parsed = Input.safeParse({
		repositoryId: formData.get("repositoryId"),
		requirement: formData.get("requirement"),
	});
	if (!parsed.success) {
		const id = String(formData.get("repositoryId") ?? "");
		redirect(
			`/repositories/${id}?error=Requirement+must+be+10-4000+characters`,
		);
	}

	const userId = session.user.id;
	const repository = await getOwnedRepository(parsed.data.repositoryId, userId);
	if (!repository) redirect("/repositories");
	const workflowId = await startRequirementAnalysis(
		parsed.data.repositoryId,
		parsed.data.requirement,
		userId,
	);
	redirect(`/workflows/${workflowId}`);
}
