import { and, asc, desc, eq } from "drizzle-orm";
import { ImplementationPlanSchema } from "@/ai/schemas/implementation-plan";
import { RequirementAnalysisSchema } from "@/ai/schemas/requirement-analysis";
import { RepairSchema } from "@/ai/schemas/repair";
import { db } from "@/lib/db";
import {
	changeApprovals,
	codeChanges,
	implementationPlans,
	requirementAnalyses,
	repairAttempts,
	verificationRuns,
	workflowEvents,
	workflows,
} from "@/lib/db/schema";
import {
	approvalBlockers,
	isVerificationCurrent,
} from "@/lib/review/can-approve";
import { findReviewFlags, type ReviewFlag } from "@/lib/review/flags";
import { hashEdits } from "@/lib/review/hash";
import { buildHunks, limitHunks, type Hunk } from "@/lib/review/line-diff";
import { VerificationResultSchema } from "@/lib/verify/types";
import { loadEffectiveEdits } from "./effective-edits";
import { loadWorkspaceState } from "./workspace";
import { buildRequirementTrace, requirementTraceBlockers, type RequirementTrace, type UnmappedTaskEdits } from "@/lib/review/traceability";

const CONTEXT_LINES = 3;
const MAX_LINES_PER_FILE = 400;

export type ReviewFile = {
	path: string;
	isNew: boolean;
	added: number;
	removed: number;
	requirementIds: string[];
	unmappedTaskIds: string[];
	hunks: Hunk[];
	truncated: boolean;
};

export type Review = {
	files: ReviewFile[];
	requirements: RequirementTrace[];
	unmappedTasks: UnmappedTaskEdits[];
	traceBlockers: string[];
	flags: ReviewFlag[];
	blockers: string[];
	editsHash: string;
	editCount: number;
	repairCount: number;
	latestRun: { id: string; status: string } | null;
	verificationCurrent: boolean;
};

/** Builds everything the reviewer sees. Reads only; throws if the stored edits no longer apply. */
export async function loadReview(
	workflowId: string,
	repositoryId: string,
	workflowStatus: string,
): Promise<Review> {
	const state = await loadWorkspaceState(workflowId, repositoryId);

	const [planRow] = await db
		.select()
		.from(implementationPlans)
		.where(eq(implementationPlans.workflowId, workflowId));
	if (!planRow)
		throw new Error("No implementation plan found for this workflow");
	const plan = ImplementationPlanSchema.safeParse(planRow.result);
	if (!plan.success)
		throw new Error("Stored plan no longer matches the current schema");

	const [analysisRow] = await db
		.select()
		.from(requirementAnalyses)
		.where(eq(requirementAnalyses.workflowId, workflowId));
	const parsedAnalysis = analysisRow
		? RequirementAnalysisSchema.safeParse(analysisRow.result)
		: null;

	const [codeRow] = await db
		.select({ createdAt: codeChanges.createdAt })
		.from(codeChanges)
		.where(eq(codeChanges.workflowId, workflowId));

	const repairs = await db
		.select()
		.from(repairAttempts)
		.where(
			and(
				eq(repairAttempts.workflowId, workflowId),
				eq(repairAttempts.status, "accepted"),
			),
		)
		.orderBy(asc(repairAttempts.attemptNumber));
	const repairEditPaths: string[] = [];
	for (const r of repairs) {
		const parsed = RepairSchema.safeParse(r.result);
		if (!parsed.success) {
			throw new Error(
				`Stored repair attempt ${r.attemptNumber} no longer matches the current schema`,
			);
		}
		repairEditPaths.push(...parsed.data.edits.map((e) => e.path));
	}

	const [latest] = await db
		.select({
			id: verificationRuns.id,
			status: verificationRuns.status,
			result: verificationRuns.result,
			createdAt: verificationRuns.createdAt,
		})
		.from(verificationRuns)
		.where(eq(verificationRuns.workflowId, workflowId))
		.orderBy(desc(verificationRuns.createdAt))
		.limit(1);

	let skippedChecks: { name: string; reason: string }[] = [];
	if (latest) {
		const parsedRun = VerificationResultSchema.safeParse(latest.result);
		if (parsedRun.success) skippedChecks = parsedRun.data.skipped;
	}

	const editTimes = [
		...(codeRow ? [codeRow.createdAt] : []),
		...repairs.map((r) => r.createdAt),
	];
	const trace = buildRequirementTrace(
		state.edits,
		plan.data.tasks,
		parsedAnalysis?.success ? parsedAnalysis.data.functionalRequirements : [],
	);

	const files: ReviewFile[] = [...new Set(state.touched)].sort().map((path) => {
		const before = Object.prototype.hasOwnProperty.call(state.original, path)
			? state.original[path]
			: null;
		const after = state.current.get(path) ?? "";
		const all = buildHunks(before, after, CONTEXT_LINES);
		const lines = all.flatMap((h) => h.lines);
		const limited = limitHunks(all, MAX_LINES_PER_FILE);
		const pathRequirements = trace.requirements
			.filter((requirement) => requirement.tasks.some((task) => task.paths.includes(path)))
			.map((requirement) => requirement.id);
		return {
			path,
			isNew: before === null,
			added: lines.filter((l) => l.type === "+").length,
			removed: lines.filter((l) => l.type === "-").length,
			requirementIds: pathRequirements,
			unmappedTaskIds: trace.unmappedTasks
				.filter((task) => task.paths.includes(path))
				.map((task) => task.taskId),
			hunks: limited.hunks,
			truncated: limited.truncated,
		};
	});

	const verificationCurrent = latest
		? isVerificationCurrent(latest.createdAt, editTimes)
		: false;

	const traceBlockers = requirementTraceBlockers(trace, parsedAnalysis?.success === true);

	return {
		files,
		requirements: trace.requirements,
		unmappedTasks: trace.unmappedTasks,
		traceBlockers,
		flags: findReviewFlags({
			tasks: plan.data.tasks,
			edits: state.edits,
			repairEditPaths,
			skippedChecks,
		}),
		blockers: [
			...approvalBlockers({
				workflowStatus,
				latestRunStatus: latest?.status ?? null,
				verificationCurrent,
			}),
			...traceBlockers,
		],
		editsHash: hashEdits(state.edits),
		editCount: state.edits.length,
		repairCount: repairs.length,
		latestRun: latest ? { id: latest.id, status: latest.status } : null,
		verificationCurrent,
	};
}

/**
 * Records approval of the exact current edits. Rechecks every condition on the server.
 * Returns a message when approval was refused, otherwise null. Writes nothing to any repository.
 */
export async function approveChanges(
	workflowId: string,
	userId: string,
): Promise<string | null> {
	const [wf] = await db
		.select({ repositoryId: workflows.repositoryId, status: workflows.status })
		.from(workflows)
		.where(eq(workflows.id, workflowId));
	if (!wf) return "Workflow not found";

	let review: Review;
	try {
		review = await loadReview(workflowId, wf.repositoryId, wf.status);
	} catch (err) {
		return err instanceof Error ? err.message : String(err);
	}
	if (review.blockers.length > 0) return review.blockers.join("; ");

	let claimedOk = false;
	await db.transaction(async (tx) => {
		const [claimed] = await tx
			.update(workflows)
			.set({ status: "changes_approved", error: null, updatedAt: new Date() })
			.where(
				and(
					eq(workflows.id, workflowId),
					eq(workflows.status, "changes_generated"),
				),
			)
			.returning({ id: workflows.id });
		if (!claimed) return;
		claimedOk = true;
		await tx.insert(changeApprovals).values({
			workflowId,
			decision: "approved",
			decidedBy: `user:${userId}`,
			editsHash: review.editsHash,
			verificationRunId: review.latestRun?.id ?? null,
		});
		await tx.insert(workflowEvents).values({
			workflowId,
			type: "CHANGES_APPROVED",
			actor: `user:${userId}`,
			metadata: {
				editsHash: review.editsHash,
				verificationRunId: review.latestRun?.id ?? null,
				repairCount: review.repairCount,
			},
		});
	});
	return claimedOk ? null : "The workflow changed state; nothing was approved";
}

/** Records a rejection with a reason. Final for this workflow. */
export async function rejectChanges(
	workflowId: string,
	userId: string,
	reason: string,
): Promise<void> {
	const [latest] = await db
		.select({ id: verificationRuns.id })
		.from(verificationRuns)
		.where(eq(verificationRuns.workflowId, workflowId))
		.orderBy(desc(verificationRuns.createdAt))
		.limit(1);

	let editsHash: string;
	try {
		editsHash = hashEdits(await loadEffectiveEdits(workflowId));
	} catch {
		return;
	}

	await db.transaction(async (tx) => {
		const [claimed] = await tx
			.update(workflows)
			.set({ status: "changes_rejected", error: null, updatedAt: new Date() })
			.where(
				and(
					eq(workflows.id, workflowId),
					eq(workflows.status, "changes_generated"),
				),
			)
			.returning({ id: workflows.id });
		if (!claimed) return;
		await tx.insert(changeApprovals).values({
			workflowId,
			decision: "rejected",
			decidedBy: `user:${userId}`,
			reason,
			editsHash,
			verificationRunId: latest?.id ?? null,
		});
		await tx.insert(workflowEvents).values({
			workflowId,
			type: "CHANGES_REJECTED",
			actor: `user:${userId}`,
			metadata: { reason, editsHash },
		});
	});
}
