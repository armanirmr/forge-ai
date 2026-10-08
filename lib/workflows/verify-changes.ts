import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { and, eq, lt, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { verificationRuns, workflowEvents, workflows } from "@/lib/db/schema";
import { dockerExec } from "@/lib/verify/docker-exec";
import { SANDBOX_IMAGE, verifyInDocker } from "@/lib/verify/docker-verify";
import { isSafeRelativePath } from "@/lib/verify/safe-path";
import { selectChecks } from "@/lib/verify/select-checks";
import { VERIFY_STALE_MS, type VerificationResult } from "@/lib/verify/types";
import { loadWorkspaceState } from "./workspace";

export async function logEvent(
	workflowId: string,
	type: string,
	actor: string,
	metadata: Record<string, unknown> = {},
) {
	await db.insert(workflowEvents).values({ workflowId, type, actor, metadata });
}

async function writeWorkspace(files: Map<string, string>): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "changeweft-verify-"));
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

/** Runs the repository's own scripts against the current edits. Never throws. */
export async function executeVerification(
	workflowId: string,
	repositoryId: string,
): Promise<VerificationResult> {
	let workspace: string | null = null;
	try {
		const state = await loadWorkspaceState(workflowId, repositoryId);
		const unsafeEdited = state.touched.filter((p) => !isSafeRelativePath(p));
		if (unsafeEdited.length > 0) {
			throw new Error(
				`Refusing to write unsafe paths: ${unsafeEdited.join(", ")}`,
			);
		}
		const safe = new Map(
			[...state.current].filter(([p]) => isSafeRelativePath(p)),
		);

		const notes = [
			"Workspace rebuilt from indexed files. Lockfiles, binaries, .env files and files over 500 KB are not included.",
			`Edits applied: ${state.edits.length} (generated edits plus any accepted repairs).`,
		];
		if (safe.size < state.current.size) {
			notes.push(
				`${state.current.size - safe.size} indexed paths were left out because they are not safe relative paths.`,
			);
		}

		const selection = selectChecks(safe.get("package.json"));
		if (selection.error || selection.checks.length === 0) {
			return {
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
		}

		workspace = await writeWorkspace(safe);
		return await verifyInDocker({
			workspaceDir: workspace,
			checks: selection.checks,
			skipped: selection.skipped,
			notes,
			exec: dockerExec,
		});
	} catch (err) {
		return errorResult(err instanceof Error ? err.message : String(err));
	} finally {
		if (workspace)
			await rm(workspace, { recursive: true, force: true }).catch(
				() => undefined,
			);
	}
}

export async function recordVerification(
	workflowId: string,
	result: VerificationResult,
	startedAt: number,
): Promise<string> {
	const [run] = await db
		.insert(verificationRuns)
		.values({
			workflowId,
			status: result.status,
			result,
			durationMs: Date.now() - startedAt,
		})
		.returning({ id: verificationRuns.id });
	await logEvent(workflowId, "VERIFICATION_COMPLETED", "system", {
		status: result.status,
		steps: result.steps.map((s) => ({
			name: s.name,
			exitCode: s.exitCode,
			timedOut: s.timedOut,
		})),
	});
	return run.id;
}

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
	try {
		const result = await executeVerification(workflowId, claimed.repositoryId);
		await recordVerification(workflowId, result, started);
	} finally {
		await db
			.update(workflows)
			.set({ status: "changes_generated", updatedAt: new Date() })
			.where(eq(workflows.id, workflowId));
	}
}
