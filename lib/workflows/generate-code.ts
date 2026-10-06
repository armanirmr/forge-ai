import { and, asc, eq, inArray } from "drizzle-orm";
import { codeGenerator } from "@/ai/agents/code-generator";
import { ImplementationPlanSchema } from "@/ai/schemas/implementation-plan";
import { RequirementAnalysisSchema } from "@/ai/schemas/requirement-analysis";
import { getProvider } from "@/lib/ai/config";
import { runAgent } from "@/lib/ai/run-agent";
import { db } from "@/lib/db";
import {
	aiRuns,
	codeChanges,
	implementationPlans,
	repositories,
	repositoryFiles,
	requirementAnalyses,
	workflowEvents,
	workflows,
} from "@/lib/db/schema";
import { redactSecrets } from "@/lib/security/redact";
import { collectImportClosure } from "@/lib/repository/local-imports";

const MAX_CONTEXT_CHARS = 60_000;
const MAX_REFERENCE_PER_DIR = 3;
const MAX_REFERENCE_FILES = 12;

async function logEvent(
	workflowId: string,
	type: string,
	actor: string,
	metadata: Record<string, unknown> = {},
) {
	await db.insert(workflowEvents).values({ workflowId, type, actor, metadata });
}

const dirOf = (p: string) =>
	p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";

/** Read-only context: a few sibling files next to each file the plan will create. */
function pickReferencePaths(
	createPaths: string[],
	treePaths: string[],
	exclude: Set<string>,
): string[] {
	const picked: string[] = [];
	for (const dir of new Set(createPaths.map(dirOf))) {
		const siblings = treePaths.filter(
			(p) => !exclude.has(p) && dirOf(p) === dir,
		);
		picked.push(...siblings.slice(0, MAX_REFERENCE_PER_DIR));
	}
	return [...new Set(picked)];
}

/** Records the human decision. Code generation is only possible after this. */
export async function approvePlan(
	workflowId: string,
	userId: string,
): Promise<void> {
	const [updated] = await db
		.update(workflows)
		.set({ status: "plan_approved", error: null, updatedAt: new Date() })
		.where(
			and(eq(workflows.id, workflowId), eq(workflows.status, "plan_completed")),
		)
		.returning({ id: workflows.id });
	if (updated) await logEvent(workflowId, "PLAN_APPROVED", `user:${userId}`);
}

/** A failed generation does not invalidate the approval: go back so the user can retry. */
async function revertToApproved(workflowId: string, message: string) {
	await db
		.update(workflows)
		.set({ status: "plan_approved", error: message, updatedAt: new Date() })
		.where(eq(workflows.id, workflowId));
	await logEvent(workflowId, "CODE_GENERATION_FAILED", "system", {
		error: message,
	});
}

/**
 * Generates validated search/replace edits for an approved plan.
 * Writes nothing to any repository. Never throws for AI or configuration failures.
 */
export async function startCodeGeneration(
	workflowId: string,
	userId: string,
): Promise<void> {
	const [claimed] = await db
		.update(workflows)
		.set({ status: "generating", error: null, updatedAt: new Date() })
		.where(
			and(eq(workflows.id, workflowId), eq(workflows.status, "plan_approved")),
		)
		.returning({
			repositoryId: workflows.repositoryId,
			requirement: workflows.requirement,
		});
	if (!claimed) return;

	await logEvent(workflowId, "CODE_GENERATION_REQUESTED", `user:${userId}`);

	try {
		const [repo] = await db
			.select()
			.from(repositories)
			.where(eq(repositories.id, claimed.repositoryId));
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

		const [analysisRow] = await db
			.select()
			.from(requirementAnalyses)
			.where(eq(requirementAnalyses.workflowId, workflowId));
		if (!analysisRow)
			throw new Error("No requirement analysis found for this workflow");
		const analysis = RequirementAnalysisSchema.safeParse(analysisRow.result);
		if (!analysis.success)
			throw new Error("Stored analysis no longer matches the current schema");

		const modifyPaths = [
			...new Set(plan.data.tasks.flatMap((t) => t.modifiesFiles)),
		];
		const createPaths = [
			...new Set(plan.data.tasks.flatMap((t) => t.createsFiles)),
		];

		const treePaths = (
			await db
				.select({ path: repositoryFiles.path })
				.from(repositoryFiles)
				.where(eq(repositoryFiles.repositoryId, claimed.repositoryId))
				.orderBy(asc(repositoryFiles.path))
		).map((r) => r.path);
		const tree = new Set(treePaths);

		const missing = modifyPaths.filter((p) => !tree.has(p));
		if (missing.length > 0) {
			throw new Error(
				`The plan modifies files that are not indexed: ${missing.join(", ")}`,
			);
		}
		const existing = createPaths.filter((p) => tree.has(p));
		if (existing.length > 0) {
			throw new Error(
				`The plan creates files that already exist: ${existing.join(", ")}`,
			);
		}

		const byPath = new Map<string, string>();
		const load = async (paths: string[]) => {
			const toFetch = paths.filter((p) => !byPath.has(p));
			if (toFetch.length > 0) {
				const rows = await db
					.select({
						path: repositoryFiles.path,
						content: repositoryFiles.content,
					})
					.from(repositoryFiles)
					.where(
						and(
							eq(repositoryFiles.repositoryId, claimed.repositoryId),
							inArray(repositoryFiles.path, toFetch),
						),
					);
				for (const r of rows) byPath.set(r.path, r.content);
			}
			const out = new Map<string, string>();
			for (const p of paths) {
				const content = byPath.get(p);
				if (content !== undefined) out.set(p, content);
			}
			return out;
		};

		await load(modifyPaths);
		const roots = modifyPaths.map((path) => ({
			path,
			content: byPath.get(path) ?? "",
		}));
		// Types and implementations the edited files depend on come first, then siblings of new files.
		const imported = await collectImportClosure(roots, tree, load);
		const siblings = pickReferencePaths(
			createPaths,
			treePaths,
			new Set(modifyPaths),
		);
		const referencePaths = [...new Set([...imported, ...siblings])]
			.filter((p) => !modifyPaths.includes(p))
			.slice(0, MAX_REFERENCE_FILES);
		await load(referencePaths);

		// Files we will edit are sent verbatim, so refuse to send any that look like they hold a secret.
		let used = 0;
		const editableFiles = modifyPaths.map((path) => {
			const content = byPath.get(path) ?? "";
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
				`Files to modify are too large for one generation (${used} characters, limit ${MAX_CONTEXT_CHARS})`,
			);
		}

		const referenceFiles: { path: string; content: string }[] = [];
		for (const path of referencePaths) {
			const content = redactSecrets(byPath.get(path) ?? "").text;
			if (used + content.length > MAX_CONTEXT_CHARS) continue;
			used += content.length;
			referenceFiles.push({ path, content });
		}

		await logEvent(workflowId, "CODE_CONTEXT_SELECTED", "system", {
			editable: editableFiles.map((f) => f.path),
			reference: referenceFiles.map((f) => f.path),
		});

		const provider = getProvider();
		const result = await runAgent(
			codeGenerator,
			{
				requirement: redactSecrets(claimed.requirement).text,
				repository: {
					owner: repo.owner,
					name: repo.name,
					defaultBranch: repo.defaultBranch,
					language: repo.language,
				},
				fileTree: treePaths.slice(0, 300),
				analysis: analysis.data,
				plan: plan.data,
				editableFiles,
				referenceFiles,
			},
			provider,
		);

		let lastRunId: string | null = null;
		for (const a of result.attempts) {
			const [run] = await db
				.insert(aiRuns)
				.values({
					workflowId,
					agent: codeGenerator.name,
					model: a.model,
					promptVersion: codeGenerator.promptVersion,
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
			await revertToApproved(workflowId, result.error);
			return;
		}

		await db.insert(codeChanges).values({
			workflowId,
			aiRunId: lastRunId,
			result: result.output,
		});
		await db
			.update(workflows)
			.set({ status: "changes_generated", updatedAt: new Date() })
			.where(eq(workflows.id, workflowId));
		await logEvent(
			workflowId,
			"CODE_GENERATED",
			`agent:${codeGenerator.name}`,
			{
				attempts: result.attempts.length,
				edits: result.output.edits.length,
			},
		);
	} catch (err) {
		await revertToApproved(
			workflowId,
			err instanceof Error ? err.message : String(err),
		);
	}
}
