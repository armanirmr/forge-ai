import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { and, eq, lt, or } from "drizzle-orm";
import { CodeChangeSchema } from "@/ai/schemas/code-generation";
import { db } from "@/lib/db";
import {
	codeChanges,
	repositoryFiles,
	verificationRuns,
	workflowEvents,
	workflows,
} from "@/lib/db/schema";
import { applyEdits } from "@/lib/patch/apply-edits";
import { dockerExec } from "@/lib/verify/docker-exec";
import { SANDBOX_IMAGE, verifyInDocker } from "@/lib/verify/docker-verify";
import { isSafeRelativePath } from "@/lib/verify/safe-path";
import { selectChecks } from "@/lib/verify/select-checks";
import { VERIFY_STALE_MS, type VerificationResult } from "@/lib/verify/types";

async function logEvent(
	workflowId: string,
	type: string,
	actor: string,
	metadata: Record<string, unknown> = {},
) {
	await db.insert(workflowEvents).values({ workflowId, type, actor, metadata });
}

async function writeWorkspace(files: Map<string, string>): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "forge-verify-"));
	for (const [rel, content] of files) {
		const target = resolve(root, rel);
		if (!target.startsWith(root + sep)) throw new Error(`Unsafe path: ${rel}`);
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, content, "utf8");
	}
	return root;
}

const errorResult = (message: string): VerificationResult => ({
	status: "error",
	message,
	image: SANDBOX_IMAGE,
	steps: [],
	skipped: [],
	notes: [],
	cleanupOk: true,
});

/**
 * Applies the generated edits to a rebuilt copy of the repository and runs its own
 * scripts in an isolated container. Writes nothing to the repository. Never throws.
 */
export async function startVerification(
	workflowId: string,
	userId: string,
): Promise<void> {
	const [claimed] = await db
		.update(workflows)
		.set({ status: "verifying", error: null, updatedAt: new Date() })
		.where(
			and(
				eq(workflows.id, workflowId),
				or(
					eq(workflows.status, "changes_generated"),
					and(
						eq(workflows.status, "verifying"),
						lt(workflows.updatedAt, new Date(Date.now() - VERIFY_STALE_MS)),
					),
				),
			),
		)
		.returning({ repositoryId: workflows.repositoryId });
	if (!claimed) return;

	await logEvent(workflowId, "VERIFICATION_REQUESTED", `user:${userId}`);
	const started = Date.now();
	let workspace: string | null = null;
	let result: VerificationResult;

	try {
		const [row] = await db
			.select()
			.from(codeChanges)
			.where(eq(codeChanges.workflowId, workflowId));
		if (!row) throw new Error("No generated changes found for this workflow");
		const change = CodeChangeSchema.safeParse(row.result);
		if (!change.success)
			throw new Error("Stored changes no longer match the current schema");

		const rows = await db
			.select({ path: repositoryFiles.path, content: repositoryFiles.content })
			.from(repositoryFiles)
			.where(eq(repositoryFiles.repositoryId, claimed.repositoryId));
		const original = Object.fromEntries(rows.map((r) => [r.path, r.content]));

		const applied = applyEdits(original, change.data.edits);
		if (!applied.ok) {
			throw new Error(
				`The generated edits no longer apply to the indexed files (was the repository re-imported?): ${applied.problems.join("; ")}`,
			);
		}
		const unsafeEdited = applied.files.filter(
			(f) => !isSafeRelativePath(f.path),
		);
		if (unsafeEdited.length > 0) {
			throw new Error(
				`Refusing to write unsafe paths: ${unsafeEdited.map((f) => f.path).join(", ")}`,
			);
		}

		const merged = new Map(Object.entries(original));
		for (const f of applied.files) merged.set(f.path, f.after);
		const safe = new Map([...merged].filter(([p]) => isSafeRelativePath(p)));

		const notes = [
			"Workspace rebuilt from indexed files. Lockfiles, binaries, .env files and files over 500 KB are not included.",
		];
		if (safe.size < merged.size) {
			notes.push(
				`${merged.size - safe.size} indexed paths were left out because they are not safe relative paths.`,
			);
		}

		const selection = selectChecks(safe.get("package.json"));
		if (selection.error || selection.checks.length === 0) {
			result = {
				status: "not_executed",
				message:
					selection.error ??
					"No runnable scripts (typecheck, lint, test) were found in package.json.",
				image: SANDBOX_IMAGE,
				steps: [],
				skipped: selection.skipped,
				notes,
				cleanupOk: true,
			};
		} else {
			workspace = await writeWorkspace(safe);
			result = await verifyInDocker({
				workspaceDir: workspace,
				checks: selection.checks,
				skipped: selection.skipped,
				notes,
				exec: dockerExec,
			});
		}
	} catch (err) {
		result = errorResult(err instanceof Error ? err.message : String(err));
	} finally {
		if (workspace)
			await rm(workspace, { recursive: true, force: true }).catch(
				() => undefined,
			);
	}

	try {
		await db.insert(verificationRuns).values({
			workflowId,
			status: result.status,
			result,
			durationMs: Date.now() - started,
		});
		await logEvent(workflowId, "VERIFICATION_COMPLETED", "system", {
			status: result.status,
			steps: result.steps.map((s) => ({
				name: s.name,
				exitCode: s.exitCode,
				timedOut: s.timedOut,
			})),
		});
	} finally {
		await db
			.update(workflows)
			.set({ status: "changes_generated", updatedAt: new Date() })
			.where(eq(workflows.id, workflowId));
	}
}
