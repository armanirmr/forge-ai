import { and, eq } from "drizzle-orm";
import { after } from "next/server";
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
import { getOwnedRepository, getOwnedWorkflow } from "@/lib/security/tenant-access";
import { isWorkflowCancelled } from "./cancel";

async function logEvent(
	workflowId: string,
	type: string,
	actor: string,
	metadata: Record<string, unknown> = {},
) {
	await db.insert(workflowEvents).values({ workflowId, type, actor, metadata });
}

async function failWorkflow(workflowId: string, message: string) {
	const [failed] = await db
		.update(workflows)
		.set({ status: "failed", error: message, updatedAt: new Date() })
		.where(and(eq(workflows.id, workflowId), eq(workflows.status, "analyzing")))
		.returning({ id: workflows.id });
	if (failed) await logEvent(workflowId, "ANALYSIS_FAILED", "system", { error: message });
}

async function analyzeWorkflow(
	workflowId: string,
	repositoryId: string,
	requirement: string,
	userId: string,
) {
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
		await logEvent(workflowId, "REPOSITORY_SEARCHED", "system", {
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
					workflowId,
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
		if (await isWorkflowCancelled(workflowId)) return;

		if (!result.ok) {
			await failWorkflow(workflowId, result.error);
			return;
		}

		await db.transaction(async (tx) => {
			const [completed] = await tx.update(workflows)
				.set({ status: "analysis_completed", error: null, updatedAt: new Date() })
				.where(and(eq(workflows.id, workflowId), eq(workflows.status, "analyzing")))
				.returning({ id: workflows.id });
			if (!completed) return;
			await tx.insert(requirementAnalyses).values({ workflowId, aiRunId: lastRunId, result: result.output, retrievedContext: meta });
			await tx.insert(workflowEvents).values({
				workflowId, type: "ANALYSIS_COMPLETED", actor: `agent:${requirementAnalyst.name}`,
				metadata: { attempts: result.attempts.length },
			});
		});
	} catch (err) {
		await failWorkflow(workflowId, err instanceof Error ? err.message : String(err));
	}
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
	after(async () => analyzeWorkflow(wf.id, repositoryId, requirement, userId));

	return wf.id;
}

/** Retries only a failed initial analysis; a conditional update prevents duplicate runs. */
export async function retryRequirementAnalysis(workflowId: string, userId: string): Promise<boolean> {
	const owned = await getOwnedWorkflow(workflowId, userId);
	if (!owned || owned.workflow.status !== "failed" || owned.workflow.archivedAt) return false;
	const [existingAnalysis] = await db
		.select({ id: requirementAnalyses.id })
		.from(requirementAnalyses)
		.where(eq(requirementAnalyses.workflowId, workflowId));
	if (existingAnalysis) return false;

	const [claimed] = await db
		.update(workflows)
		.set({ status: "analyzing", error: null, updatedAt: new Date() })
		.where(and(
			eq(workflows.id, workflowId),
			eq(workflows.createdByUserId, userId),
			eq(workflows.status, "failed"),
		))
		.returning({ repositoryId: workflows.repositoryId, requirement: workflows.requirement });
	if (!claimed) return false;

	await logEvent(workflowId, "ANALYSIS_RETRY_REQUESTED", `user:${userId}`);
	await analyzeWorkflow(workflowId, claimed.repositoryId, claimed.requirement, userId);
	return true;
}
