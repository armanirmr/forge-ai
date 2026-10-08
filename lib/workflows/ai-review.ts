import { desc, eq } from "drizzle-orm";
import { changeReviewer } from "@/ai/agents/change-reviewer";
import type { ChangeReviewInput } from "@/ai/schemas/change-review";
import { ImplementationPlanSchema } from "@/ai/schemas/implementation-plan";
import { RequirementAnalysisSchema } from "@/ai/schemas/requirement-analysis";
import { getProvider } from "@/lib/ai/config";
import { runAgent, type AttemptRecord } from "@/lib/ai/run-agent";
import { db } from "@/lib/db";
import {
	aiRuns,
	changeReviews,
	implementationPlans,
	repositories,
	requirementAnalyses,
	verificationRuns,
	workflows,
} from "@/lib/db/schema";
import { buildReviewDiff } from "@/lib/review/diff-text";
import { retrieveContext } from "@/lib/repository/retrieve";
import { redactSecrets } from "@/lib/security/redact";
import { VerificationResultSchema } from "@/lib/verify/types";
import { loadReview } from "./review-changes";
import { logEvent } from "./verify-changes";

/** Lower this if the provider rejects the request as too large for its token limit. */
const MAX_REVIEW_DIFF_CHARS = 14_000;
const MAX_REVIEW_CONTEXT_CHARS = 6_000;
const MAX_REVIEW_CONTEXT_SNIPPETS = 5;
const MAX_CRITERIA = 12;
const REVIEWABLE_STATUSES = [
	"changes_generated",
	"changes_approved",
	"changes_rejected",
];

async function recordAiRuns(
	workflowId: string,
	attempts: AttemptRecord[],
): Promise<string | null> {
	let lastId: string | null = null;
	for (const a of attempts) {
		const [run] = await db
			.insert(aiRuns)
			.values({
				workflowId,
				agent: changeReviewer.name,
				model: a.model,
				promptVersion: changeReviewer.promptVersion,
				inputTokens: a.inputTokens,
				outputTokens: a.outputTokens,
				durationMs: a.durationMs,
				status: a.status,
				error: a.error ?? null,
			})
			.returning({ id: aiRuns.id });
		lastId = run.id;
	}
	return lastId;
}

/**
 * Asks the configured AI provider for one review of the current final diff.
 * The result is an opinion: it never changes the workflow and never gates approval.
 * Never throws; failures are stored and shown.
 */
export async function startAiReview(
	workflowId: string,
	userId: string,
): Promise<void> {
	const [wf] = await db
		.select({
			repositoryId: workflows.repositoryId,
			status: workflows.status,
			requirement: workflows.requirement,
		})
		.from(workflows)
		.where(eq(workflows.id, workflowId));
	if (!wf || !REVIEWABLE_STATUSES.includes(wf.status)) return;

	await logEvent(workflowId, "AI_REVIEW_REQUESTED", `user:${userId}`);

	let editsHash = "";
	let aiRunId: string | null = null;
	let repositoryContextStatus: ChangeReviewInput["repositoryContext"]["status"] =
		"not_attempted";
	let repositoryContextSnippets = 0;
	try {
		const review = await loadReview(workflowId, wf.repositoryId, wf.status);
		editsHash = review.editsHash;

		const [repo] = await db
			.select()
			.from(repositories)
			.where(eq(repositories.id, wf.repositoryId));
		if (!repo) throw new Error("Repository not found");

		const [analysisRow] = await db
			.select()
			.from(requirementAnalyses)
			.where(eq(requirementAnalyses.workflowId, workflowId));
		const analysis = analysisRow
			? RequirementAnalysisSchema.safeParse(analysisRow.result)
			: null;
		if (!analysis?.success)
			throw new Error("No valid requirement analysis found for this workflow");

		const [planRow] = await db
			.select()
			.from(implementationPlans)
			.where(eq(implementationPlans.workflowId, workflowId));
		const plan = planRow
			? ImplementationPlanSchema.safeParse(planRow.result)
			: null;
		if (!plan?.success)
			throw new Error("No valid implementation plan found for this workflow");

		const [latestRun] = await db
			.select({ result: verificationRuns.result })
			.from(verificationRuns)
			.where(eq(verificationRuns.workflowId, workflowId))
			.orderBy(desc(verificationRuns.createdAt))
			.limit(1);
		const verification = latestRun
			? VerificationResultSchema.safeParse(latestRun.result)
			: null;
		if (!verification?.success)
			throw new Error("No valid verification result found for this workflow");

		const diff = buildReviewDiff(review.files, MAX_REVIEW_DIFF_CHARS);
		if (diff.files.length === 0) {
			throw new Error(
				"There is no diff that fits in a review (no net change, or the files are too large)",
			);
		}
		for (const f of diff.files) {
			const text = f.hunks
				.flatMap((h) => h.lines.map((l) => l.text))
				.join("\n");
			if (redactSecrets(text).redactions > 0) {
				throw new Error(
					`${f.path} contains what looks like a secret and will not be sent to the AI provider`,
				);
			}
		}

		const clean = (s: string) => redactSecrets(s).text;
		let repositoryContext: ChangeReviewInput["repositoryContext"] = {
			status: "unavailable",
			snippets: [],
		};
		repositoryContextStatus = "unavailable";
		try {
			const context = await retrieveContext(
				wf.repositoryId,
				[
					wf.requirement,
					...analysis.data.acceptanceCriteria,
					"Existing implementation and test coverage relevant to this change",
				].join("\n").slice(0, 7000),
				{ limit: MAX_REVIEW_CONTEXT_SNIPPETS, maxTreeEntries: 0 },
			);
			let remaining = MAX_REVIEW_CONTEXT_CHARS;
			const snippets = context.snippets.flatMap((snippet) => {
				if (remaining <= 0) return [];
				const content = clean(snippet.content).slice(0, remaining);
				remaining -= content.length;
				return content
					? [{
							path: snippet.path,
							startLine: snippet.startLine,
							endLine: snippet.endLine,
							content,
						}]
					: [];
			});
		repositoryContext = {
				status: snippets.length > 0 ? "available" : "empty",
				snippets,
			};
			repositoryContextStatus = repositoryContext.status;
			repositoryContextSnippets = snippets.length;
		} catch {
			// Repository retrieval is best effort; the diff review can still proceed.
		}
		const input: ChangeReviewInput = {
			requirement: clean(wf.requirement),
			repository: {
				owner: repo.owner,
				name: repo.name,
				defaultBranch: repo.defaultBranch,
				language: repo.language,
			},
			requirements: analysis.data.functionalRequirements.map((q) => ({
				id: q.id,
				description: clean(q.description),
				basis: q.basis,
			})),
			acceptanceCriteria: analysis.data.acceptanceCriteria
				.slice(0, MAX_CRITERIA)
				.map((text, i) => ({ id: `AC-${i + 1}`, text: clean(text) })),
			constraints: analysis.data.constraints.map(clean),
			tasks: plan.data.tasks.map((t) => ({
				id: t.id,
				title: clean(t.title),
				modifiesFiles: t.modifiesFiles,
				createsFiles: t.createsFiles,
			})),
			verification: {
				status: verification.data.status,
				steps: verification.data.steps.map((s) => ({
					name: s.name,
					exitCode: s.exitCode,
					timedOut: s.timedOut,
				})),
				skipped: verification.data.skipped,
			},
			repositoryContext,
			flags: review.flags,
			repairCount: review.repairCount,
			files: diff.files,
			omittedPaths: diff.omittedPaths,
		};

		const agentResult = await runAgent(changeReviewer, input, getProvider());
		if (agentResult.attempts.length > 0) {
			aiRunId = await recordAiRuns(workflowId, agentResult.attempts);
		}
		if (!agentResult.ok) throw new Error(agentResult.error);

		await db.insert(changeReviews).values({
			workflowId,
			aiRunId,
			editsHash,
			status: "completed",
			result: agentResult.output,
		});
		await logEvent(
			workflowId,
			"AI_REVIEW_COMPLETED",
			`agent:${changeReviewer.name}`,
			{
				editsHash,
				findings: agentResult.output.findings.length,
				repositoryContext: repositoryContextStatus,
				repositoryContextSnippets,
			},
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (editsHash) {
			await db
				.insert(changeReviews)
				.values({
					workflowId,
					aiRunId,
					editsHash,
					status: "failed",
					error: message,
				});
		}
		await logEvent(workflowId, "AI_REVIEW_FAILED", "system", {
			error: message,
			repositoryContext: repositoryContextStatus,
			repositoryContextSnippets,
		});
	}
}
