"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import {
	approvePlan,
	startCodeGeneration,
} from "@/lib/workflows/generate-code";
import {
	requestPlanChanges,
	startPlanning,
} from "@/lib/workflows/generate-plan";

async function requestContext(formData: FormData) {
	const session = await auth();
	if (!session) redirect("/");

	const parsed = z.string().uuid().safeParse(formData.get("workflowId"));
	if (!parsed.success) redirect("/repositories");

	return {
		workflowId: parsed.data,
		userId: session.user?.email ?? session.user?.name ?? "unknown",
	};
}

export async function generatePlanAction(formData: FormData) {
	const { workflowId, userId } = await requestContext(formData);
	await startPlanning(workflowId, userId);
	redirect(`/workflows/${workflowId}`);
}

export async function approvePlanAction(formData: FormData) {
	const { workflowId, userId } = await requestContext(formData);
	await approvePlan(workflowId, userId);
	redirect(`/workflows/${workflowId}`);
}

export async function generateCodeAction(formData: FormData) {
	const { workflowId, userId } = await requestContext(formData);
	await startCodeGeneration(workflowId, userId);
	redirect(`/workflows/${workflowId}`);
}

export async function requestPlanChangesAction(formData: FormData) {
	const { workflowId, userId } = await requestContext(formData);
	const feedback = z
		.string()
		.trim()
		.min(1)
		.max(2000)
		.safeParse(formData.get("feedback"));
	if (
		feedback.success &&
		(await requestPlanChanges(workflowId, userId, feedback.data))
	) {
		await startPlanning(workflowId, userId, feedback.data);
	}
	redirect(`/workflows/${workflowId}`);
}
