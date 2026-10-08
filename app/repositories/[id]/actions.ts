"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { startRequirementAnalysis } from "@/lib/workflows/analyze-requirement";
import { requireAISetup } from "@/lib/ai/setup-status";

const Input = z.object({
	repositoryId: z.string().uuid(),
	requirement: z.string().trim().min(10).max(4000),
});

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
	const workflowId = await startRequirementAnalysis(
		parsed.data.repositoryId,
		parsed.data.requirement,
		userId,
	);
	redirect(`/workflows/${workflowId}`);
}
