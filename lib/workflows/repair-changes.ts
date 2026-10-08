import { and, asc, desc, eq, lt, or } from "drizzle-orm";
import { debuggerAgent } from "@/ai/agents/debugger";
import { ImplementationPlanSchema } from "@/ai/schemas/implementation-plan";
import { RepairSchema, type RepairInput } from "@/ai/schemas/repair";
import { getProvider } from "@/lib/ai/config";
import { runAgent, type AttemptRecord } from "@/lib/ai/run-agent";
import { db } from "@/lib/db";
import {
	aiRuns,
	implementationPlans,
	repairAttempts,
	repositories,
	verificationRuns,
	workflows,
} from "@/lib/db/schema";
import { MAX_REPAIR_ATTEMPTS } from "@/lib/repair/constants";
import { pickFailures, pickMentionedPaths } from "@/lib/repair/build-input";
import { redactSecrets } from "@/lib/security/redact";
import { VERIFY_STALE_MS, VerificationResultSchema } from "@/lib/verify/types";
import {
	executeVerification,
	logEvent,
	recordVerification,
} from "./verify-changes";
import { loadWorkspaceState } from "./workspace";

const MAX_CONTEXT_CHARS = 60_000;
const MAX_REFERENCE_FILES = 6;

type LoopResult = { outcome: string; message: string | null };

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
				agent: debuggerAgent.name,
				model: a.model,
				promptVersion: debuggerAgent.promptVersion,
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

async function repairLoop(
	workflowId: string,
	repositoryId: string,
	requirement: string,
	userId: string,
): Promise<LoopResult> {
	const [repo] = await db
		.select()
		.from(repositories)
		.where(eq(repositories.id, repositoryId));

	if (!repo) throw new Error("Repository not found");

	const [planRow] = await db
		.select()
		.from(implementationPlans)
		.where(eq(implementationPlans.workflowId, workflowId));

	if (!planRow)
		throw new Error("No implementation plan found for this workflow");

	const plan = ImplementationPlanSchema.safeParse(planRow.result);

	if (!plan.success)
		throw new Error("Stored plan no longer matches the current schema");

	const provider = await getProvider(userId);

	for (;;) {
		const prior = await db
			.select()
			.from(repairAttempts)
			.where(eq(repairAttempts.workflowId, workflowId))
			.orderBy(asc(repairAttempts.attemptNumber));

		if (prior.length >= MAX_REPAIR_ATTEMPTS) {
			return {
				outcome: "exhausted",
				message: `Reached ${MAX_REPAIR_ATTEMPTS} repair attempts without a passing verification. Human intervention is required.`,
			};
		}

		const runRows = await db
			.select({
				id: verificationRuns.id,
				status: verificationRuns.status,
				result: verificationRuns.result,
				createdAt: verificationRuns.createdAt,
			})
			.from(verificationRuns)
			.where(eq(verificationRuns.workflowId, workflowId))
			.orderBy(desc(verificationRuns.createdAt));

		const lastRun = runRows[0];

		if (!lastRun) {
			return {
				outcome: "nothing_to_repair",
				message: "Run verification first.",
			};
		}

		if (lastRun.status === "passed")
			return { outcome: "passed", message: null };

		if (lastRun.status !== "failed") {
			return {
				outcome: "nothing_to_repair",
				message: `The last verification ended as "${lastRun.status}", which is not a code failure, so there is nothing to repair.`,
			};
		}

		const lastResult = VerificationResultSchema.safeParse(lastRun.result);

		if (!lastResult.success)
			throw new Error(
				"Stored verification result no longer matches the schema",
			);

		const failures = pickFailures(lastResult.data.steps);

		if (failures.length === 0) {
			return {
				outcome: "nothing_to_repair",
				message: "The failed run has no failing check output.",
			};
		}

		const state = await loadWorkspaceState(workflowId, repositoryId);

		const planPaths = [
			...new Set(
				plan.data.tasks.flatMap((t) => [...t.modifiesFiles, ...t.createsFiles]),
			),
		].filter((p) => state.current.has(p));

		let used = 0;

		const editableFiles = planPaths.map((path) => {
			const content = state.current.get(path) ?? "";

			if (redactSecrets(content).redactions > 0) {
				throw new Error(
					`${path} contains what looks like a secret and will not be sent to the AI provider`,
				);
			}

			used += content.length;

			return { path, content };
		});

		if (used > MAX_CONTEXT_CHARS) {
			throw new Error(
				`Plan files are too large for one repair (${used} characters, limit ${MAX_CONTEXT_CHARS})`,
			);
		}

		const referenceFiles: { path: string; content: string }[] = [];

		const mentioned = pickMentionedPaths(
			failures.map((f) => f.output),
			[...state.current.keys()].sort(),
			new Set(planPaths),
			MAX_REFERENCE_FILES,
		);

		for (const path of mentioned) {
			const content = redactSecrets(state.current.get(path) ?? "").text;

			if (used + content.length > MAX_CONTEXT_CHARS) continue;

			used += content.length;
			referenceFiles.push({ path, content });
		}

		const statusById = new Map(runRows.map((r) => [r.id, r.status]));

		const previousAttempts = prior.map((a) => {
			const parsed = a.result ? RepairSchema.safeParse(a.result) : null;
			const detail = parsed?.success ? parsed.data : null;
			const after = a.resultRunId ? statusById.get(a.resultRunId) : undefined;

			const outcome =
				a.status === "accepted"
					? `applied; verification afterwards: ${after ?? "unknown"}`
					: a.status === "rejected"
						? `rejected: ${a.error ?? "failed validation"}`
						: "stopped";

			return {
				attemptNumber: a.attemptNumber,
				outcome,
				rootCause: detail?.rootCause ?? null,
				summary: detail?.summary ?? null,
			};
		});

		const attemptNumber = prior.length + 1;

		const input: RepairInput = {
			requirement: redactSecrets(requirement).text,
			repository: {
				owner: repo.owner,
				name: repo.name,
				defaultBranch: repo.defaultBranch,
				language: repo.language,
			},
			plan: plan.data,
			attemptNumber,
			maxAttempts: MAX_REPAIR_ATTEMPTS,
			failures,
			previousAttempts,
			editableFiles,
			referenceFiles,
		};

		const agentResult = await runAgent(debuggerAgent, input, provider);

		const aiRunId = await recordAiRuns(workflowId, agentResult.attempts);

		if (!agentResult.ok) {
			// Provider or rate-limit failures are not repair attempts: stop without using one up.
			if (agentResult.attempts.at(-1)?.status === "failed") {
				return {
					outcome: "provider_error",
					message: agentResult.error,
				};
			}

			await db.insert(repairAttempts).values({
				workflowId,
				attemptNumber,
				verificationRunId: lastRun.id,
				aiRunId,
				status: "rejected",
				result: null,
				error: agentResult.error,
			});

			await logEvent(
				workflowId,
				"REPAIR_REJECTED",
				`agent:${debuggerAgent.name}`,
				{
					attempt: attemptNumber,
					error: agentResult.error,
				},
			);

			continue;
		}

		if (agentResult.output.cannotFixReason !== null) {
			await db.insert(repairAttempts).values({
				workflowId,
				attemptNumber,
				verificationRunId: lastRun.id,
				aiRunId,
				status: "stopped",
				result: agentResult.output,
			});

			await logEvent(
				workflowId,
				"REPAIR_STOPPED",
				`agent:${debuggerAgent.name}`,
				{
					attempt: attemptNumber,
					reason: agentResult.output.cannotFixReason,
				},
			);

			return {
				outcome: "stopped",
				message: `The debugger could not fix this safely: ${agentResult.output.cannotFixReason}`,
			};
		}

		const [attempt] = await db
			.insert(repairAttempts)
			.values({
				workflowId,
				attemptNumber,
				verificationRunId: lastRun.id,
				aiRunId,
				status: "accepted",
				result: agentResult.output,
			})
			.returning({ id: repairAttempts.id });

		await logEvent(
			workflowId,
			"REPAIR_PROPOSED",
			`agent:${debuggerAgent.name}`,
			{
				attempt: attemptNumber,
				edits: agentResult.output.edits.length,
			},
		);

		const started = Date.now();

		const verification = await executeVerification(workflowId, repositoryId);

		const runId = await recordVerification(workflowId, verification, started);

		await db
			.update(repairAttempts)
			.set({ resultRunId: runId })
			.where(eq(repairAttempts.id, attempt.id));

		if (verification.status === "passed")
			return { outcome: "passed", message: null };

		if (verification.status !== "failed") {
			return {
				outcome: "verification_error",
				message:
					verification.message ??
					`Verification ended as "${verification.status}".`,
			};
		}
	}
}

/**
 * Runs up to MAX_REPAIR_ATTEMPTS debug-and-verify cycles after a failed verification.
 * Stacks accepted fixes on the generated edits. Writes nothing to any repository.
 * Never throws.
 */
export async function startRepair(
	workflowId: string,
	userId: string,
): Promise<void> {
	const [claimed] = await db
		.update(workflows)
		.set({
			status: "repairing",
			error: null,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(workflows.id, workflowId),
				or(
					eq(workflows.status, "changes_generated"),
					and(
						eq(workflows.status, "repairing"),
						lt(workflows.updatedAt, new Date(Date.now() - VERIFY_STALE_MS)),
					),
				),
			),
		)
		.returning({
			repositoryId: workflows.repositoryId,
			requirement: workflows.requirement,
		});

	if (!claimed) return;

	await logEvent(workflowId, "REPAIR_REQUESTED", `user:${userId}`);

	let result: LoopResult;

	try {
		result = await repairLoop(
			workflowId,
			claimed.repositoryId,
			claimed.requirement,
			userId,
		);
	} catch (err) {
		result = {
			outcome: "error",
			message: err instanceof Error ? err.message : String(err),
		};
	}

	await db
		.update(workflows)
		.set({
			status: "changes_generated",
			error: result.message,
			updatedAt: new Date(),
		})
		.where(eq(workflows.id, workflowId));

	await logEvent(workflowId, "REPAIR_LOOP_ENDED", "system", {
		outcome: result.outcome,
		message: result.message,
	});
}
