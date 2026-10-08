import { eq } from "drizzle-orm";
import { requirementAnalyst } from "@/ai/agents/requirement-analyst";
import { getProvider } from "@/lib/ai/config";
import { runAgent } from "@/lib/ai/run-agent";
import { db } from "@/lib/db";
import {
	aiRuns,
	repositories,
	requirementAnalyses,
	workflowEvents,
	workflows,
} from "@/lib/db/schema";
import { retrieveContext } from "@/lib/repository/retrieve";
import { redactSecrets } from "@/lib/security/redact";
import type { RetrievedContextMeta } from "./types";
import { getOwnedRepository } from "@/lib/security/tenant-access";

async function logEvent(
	workflowId: string,
	type: string,
	actor: string,
	metadata: Record<string, unknown> = {},
) {
	await db.insert(workflowEvents).values({ workflowId, type, actor, metadata });
}

async function failWorkflow(workflowId: string, message: string) {
	await db
		.update(workflows)
		.set({ status: "failed", error: message, updatedAt: new Date() })
		.where(eq(workflows.id, workflowId));
	await logEvent(workflowId, "ANALYSIS_FAILED", "system", { error: message });
}

/**
 * Creates a workflow and runs requirement analysis. Never throws for AI or
 * configuration failures: those are recorded on the workflow and shown in the UI.
 */
export async function startRequirementAnalysis(
	repositoryId: string,
	requirement: string,
	userId: string,
): Promise<string> {
	if (!(await getOwnedRepository(repositoryId, userId))) {
		throw new Error("Repository not found");
	}
	const [wf] = await db
		.insert(workflows)
		.values({ repositoryId, requirement, status: "analyzing", createdByUserId: userId })
		.returning({ id: workflows.id });
	await logEvent(wf.id, "REQUIREMENT_CREATED", `user:${userId}`, {
		length: requirement.length,
	});

	try {
		const [repo] = await db
			.select()
			.from(repositories)
			.where(eq(repositories.id, repositoryId));
		if (!repo) throw new Error("Repository not found");

		const ctx = await retrieveContext(repositoryId, requirement, { userId });

		let redactions = 0;
		const snippets = ctx.snippets.map((s) => {
			const r = redactSecrets(s.content);
			redactions += r.redactions;
			return {
				path: s.path,
				startLine: s.startLine,
				endLine: s.endLine,
				content: r.text,
			};
		});
		const req = redactSecrets(requirement);
		redactions += req.redactions;

		const meta: RetrievedContextMeta = {
			keywords: ctx.keywords,
			snippets: ctx.snippets.map(({ path, startLine, endLine, score }) => ({
				path,
				startLine,
				endLine,
				score,
			})),
			fileTreeShown: ctx.fileTree.length,
			fileTreeTotal: ctx.fileTreeTotal,
			redactions,
		};
		await logEvent(wf.id, "REPOSITORY_SEARCHED", "system", {
			keywords: ctx.keywords,
			files: [...new Set(ctx.snippets.map((s) => s.path))],
			redactions,
		});

		const provider = await getProvider(userId);
		const result = await runAgent(
			requirementAnalyst,
			{
				requirement: req.text,
				repository: {
					owner: repo.owner,
					name: repo.name,
					defaultBranch: repo.defaultBranch,
					language: repo.language,
				},
				fileTree: ctx.fileTree,
				fileTreeTotal: ctx.fileTreeTotal,
				snippets,
			},
			provider,
		);

		let lastRunId: string | null = null;
		for (const a of result.attempts) {
			const [run] = await db
				.insert(aiRuns)
				.values({
					workflowId: wf.id,
					agent: requirementAnalyst.name,
					model: a.model,
					promptVersion: requirementAnalyst.promptVersion,
					inputTokens: a.inputTokens,
					outputTokens: a.outputTokens,
					durationMs: a.durationMs,
					status: a.status,
					error: a.error ?? null,
				})
				.returning({ id: aiRuns.id });
			lastRunId = run.id;
		}

		if (!result.ok) {
			await failWorkflow(wf.id, result.error);
			return wf.id;
		}

		await db.insert(requirementAnalyses).values({
			workflowId: wf.id,
			aiRunId: lastRunId,
			result: result.output,
			retrievedContext: meta,
		});
		await db
			.update(workflows)
			.set({ status: "analysis_completed", updatedAt: new Date() })
			.where(eq(workflows.id, wf.id));
		await logEvent(
			wf.id,
			"ANALYSIS_COMPLETED",
			`agent:${requirementAnalyst.name}`,
			{
				attempts: result.attempts.length,
			},
		);
	} catch (err) {
		await failWorkflow(wf.id, err instanceof Error ? err.message : String(err));
	}

	return wf.id;
}
