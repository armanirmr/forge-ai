import { and, asc, eq, inArray } from "drizzle-orm";
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
import { isWorkflowCancelled } from "./cancel";

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
	const [reset] = await db
		.update(workflows)
		.set({
			status: "analysis_completed",
			error: message,
			updatedAt: new Date(),
		})
		.where(and(eq(workflows.id, workflowId), eq(workflows.status, "planning")))
		.returning({ id: workflows.id });
	if (reset) await logEvent(workflowId, "PLAN_FAILED", "system", { error: message });
}

/** All reviewer feedback given on this workflow so far, oldest first. */
async function feedbackHistory(workflowId: string): Promise<string[]> {
	const rows = await db
		.select({ metadata: workflowEvents.metadata })
		.from(workflowEvents)
		.where(
			and(
				eq(workflowEvents.workflowId, workflowId),
				eq(workflowEvents.type, "PLAN_CHANGES_REQUESTED"),
			),
		)
		.orderBy(asc(workflowEvents.createdAt));
	return rows
		.map((r) => (r.metadata as { feedback?: unknown } | null)?.feedback)
		.filter((f): f is string => typeof f === "string")
		.slice(-4);
}

/**
 * Generates the implementation plan for a workflow whose analysis is complete.
 * Never throws for AI or configuration failures: they are recorded on the workflow.
 */
export async function startPlanning(
	workflowId: string,
	userId: string,
	feedback?: string,
): Promise<void> {
	const history = await feedbackHistory(workflowId);
	const effectiveFeedback = history.length
		? history.map((f, i) => `${i + 1}. ${f}`).join("\n")
		: feedback;
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

	await logEvent(workflowId, "PLAN_REQUESTED", `user:${userId}`, {
		withFeedback: Boolean(effectiveFeedback),
	});

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
			{ userId },
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
		const fb = effectiveFeedback ? redactSecrets(effectiveFeedback) : null;
		if (fb) redactions += fb.redactions;

		const provider = await getProvider(userId);
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
				feedback: fb?.text,
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
		if (await isWorkflowCancelled(workflowId)) return;

		if (!result.ok) {
			await revertToAnalysis(workflowId, result.error);
			return;
		}

		await db.transaction(async (tx) => {
			const [completed] = await tx.update(workflows)
				.set({ status: "plan_completed", updatedAt: new Date() })
				.where(and(eq(workflows.id, workflowId), eq(workflows.status, "planning")))
				.returning({ id: workflows.id });
			if (!completed) return;
			await tx.insert(implementationPlans).values({ workflowId, aiRunId: lastRunId, result: result.output });
			await tx.insert(workflowEvents).values({
				workflowId, type: "PLAN_GENERATED", actor: `agent:${implementationPlanner.name}`,
				metadata: { attempts: result.attempts.length, tasks: result.output.tasks.length, redactions },
			});
		});
	} catch (err) {
		await revertToAnalysis(
			workflowId,
			err instanceof Error ? err.message : String(err),
		);
	}
}

export const MAX_FEEDBACK_CHARS = 2000;

/**
 * Withdraws any approval and discards the current draft so a new plan can be generated.
 * The discarded plan is kept in the PLAN_CHANGES_REQUESTED event, so nothing is lost.
 * Returns false if nothing changed: empty or oversized feedback, or a workflow that is
 * not in plan_completed / plan_approved (for example, code generation already started).
 */
export async function requestPlanChanges(
	workflowId: string,
	userId: string,
	feedback: string,
): Promise<boolean> {
	if (feedback.length === 0 || feedback.length > MAX_FEEDBACK_CHARS)
		return false;
	const safeFeedback = redactSecrets(feedback).text;

	return db.transaction(async (tx) => {
		const [before] = await tx
			.select({ status: workflows.status })
			.from(workflows)
			.where(eq(workflows.id, workflowId));

		const [reset] = await tx
			.update(workflows)
			.set({ status: "analysis_completed", error: null, updatedAt: new Date() })
			.where(
				and(
					eq(workflows.id, workflowId),
					inArray(workflows.status, ["plan_completed", "plan_approved"]),
				),
			)
			.returning({ id: workflows.id });
		if (!reset) return false;

		const [plan] = await tx
			.select()
			.from(implementationPlans)
			.where(eq(implementationPlans.workflowId, workflowId));

		await tx.insert(workflowEvents).values({
			workflowId,
			type: "PLAN_CHANGES_REQUESTED",
			actor: `user:${userId}`,
			metadata: {
				feedback: safeFeedback,
				wasApproved: before?.status === "plan_approved",
				previousPlan: plan?.result ?? null,
			},
		});
		await tx
			.delete(implementationPlans)
			.where(eq(implementationPlans.workflowId, workflowId));
		return true;
	});
}
