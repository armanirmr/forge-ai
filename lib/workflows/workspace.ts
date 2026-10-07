import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { repositoryFiles } from "@/lib/db/schema";
import { applyEdits } from "@/lib/patch/apply-edits";
import { loadEffectiveEdits, type CodeEdit } from "./effective-edits";

export type WorkspaceState = {
	original: Record<string, string>;
	/** Every indexed file after all edits (generated plus accepted repairs). */
	current: Map<string, string>;
	edits: CodeEdit[];
	touched: string[];
};

export async function loadWorkspaceState(
	workflowId: string,
	repositoryId: string,
): Promise<WorkspaceState> {
	const edits = await loadEffectiveEdits(workflowId);
	const rows = await db
		.select({ path: repositoryFiles.path, content: repositoryFiles.content })
		.from(repositoryFiles)
		.where(eq(repositoryFiles.repositoryId, repositoryId));
	const original = Object.fromEntries(rows.map((r) => [r.path, r.content]));

	const applied = applyEdits(original, edits);
	if (!applied.ok) {
		throw new Error(
			`The generated edits no longer apply to the indexed files (was the repository re-imported?): ${applied.problems.join("; ")}`,
		);
	}

	const current = new Map(Object.entries(original));
	for (const f of applied.files) current.set(f.path, f.after);
	return {
		original,
		current,
		edits,
		touched: applied.files.map((f) => f.path),
	};
}
