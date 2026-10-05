"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { startPlanning } from "@/lib/workflows/generate-plan";

export async function generatePlanAction(formData: FormData) {
	const session = await auth();
	if (!session) redirect("/");

	const parsed = z.string().uuid().safeParse(formData.get("workflowId"));
	if (!parsed.success) redirect("/repositories");

	const userId = session.user?.email ?? session.user?.name ?? "unknown";
	await startPlanning(parsed.data, userId);
	redirect(`/workflows/${parsed.data}`);
}
