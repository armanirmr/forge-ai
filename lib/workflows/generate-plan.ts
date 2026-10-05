import { and, eq } from "drizzle-orm";
import { implementationPlanner } from "@/ai/agents/implementation-planner";
import { RequirementAnalysisSchema } from "@/ai/schemas/requirement-analysis";
import { getProvider } from "@/lib/ai/config";
import { runAgent } from "@/lib/ai/run-agent";
import { db } from "@/lib/db";
import {
	aiRuns,
	implementationPlans,
	repositories,
	requirementAnalyses,
	workflowEvents,
	workflows,
} from "@/lib/db/schema";
import { retrieveContext } from "@/lib/repository/retrieve";
import { redactSecrets } from "@/lib/security/redact";

async function logEvent(
	workflowId: string,
	type: string,
	actor: string,
	metadata: Record<string, unknown> = {},
) {
	await db.insert(workflowEvents).values({ workflowId, type, actor, metadata });
}

/** A failed plan does not invalidate the analysis: go back so the user can retry. */
async function revertToAnalysis(workflowId: string, message: string) {
	await db
		.update(workflows)
		.set({
			status: "analysis_completed",
			error: message,
			updatedAt: new Date(),
		})
		.where(eq(workflows.id, workflowId));
	await logEvent(workflowId, "PLAN_FAILED", "system", { error: message });
}

/**
 * Generates the implementation plan for a workflow whose analysis is complete.
 * Never throws for AI or configuration failures: they are recorded on the workflow.
 */
export async function startPlanning(
	workflowId: string,
	userId: string,
): Promise<void> {
	// Atomic claim: only one request can move analysis_completed -> planning.
	const [claimed] = await db
		.update(workflows)
		.set({ status: "planning", error: null, updatedAt: new Date() })
		.where(
			and(
				eq(workflows.id, workflowId),
				eq(workflows.status, "analysis_completed"),
			),
		)
		.returning({
			repositoryId: workflows.repositoryId,
			requirement: workflows.requirement,
		});
	if (!claimed) return;

	await logEvent(workflowId, "PLAN_REQUESTED", `user:${userId}`);

	try {
		const [repo] = await db
			.select()
			.from(repositories)
			.where(eq(repositories.id, claimed.repositoryId));
		if (!repo) throw new Error("Repository not found");

		const [analysisRow] = await db
			.select()
			.from(requirementAnalyses)
			.where(eq(requirementAnalyses.workflowId, workflowId));
		if (!analysisRow)
			throw new Error("No requirement analysis found for this workflow");
		const analysis = RequirementAnalysisSchema.safeParse(analysisRow.result);
		if (!analysis.success)
			throw new Error("Stored analysis no longer matches the current schema");

		const ctx = await retrieveContext(
			claimed.repositoryId,
			claimed.requirement,
		);
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
		const req = redactSecrets(claimed.requirement);
		redactions += req.redactions;

		const provider = getProvider();
		const result = await runAgent(
			implementationPlanner,
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
				analysis: analysis.data,
			},
			provider,
		);

		let lastRunId: string | null = null;
		for (const a of result.attempts) {
			const [run] = await db
				.insert(aiRuns)
				.values({
					workflowId,
					agent: implementationPlanner.name,
					model: a.model,
					promptVersion: implementationPlanner.promptVersion,
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
			await revertToAnalysis(workflowId, result.error);
			return;
		}

		await db.insert(implementationPlans).values({
			workflowId,
			aiRunId: lastRunId,
			result: result.output,
		});
		await db
			.update(workflows)
			.set({ status: "plan_completed", updatedAt: new Date() })
			.where(eq(workflows.id, workflowId));
		await logEvent(
			workflowId,
			"PLAN_GENERATED",
			`agent:${implementationPlanner.name}`,
			{
				attempts: result.attempts.length,
				tasks: result.output.tasks.length,
				redactions,
			},
		);
	} catch (err) {
		await revertToAnalysis(
			workflowId,
			err instanceof Error ? err.message : String(err),
		);
	}
}
