import { and, asc, eq } from "drizzle-orm";
import {
	CodeChangeSchema,
	type CodeChange,
} from "@/ai/schemas/code-generation";
import { RepairSchema } from "@/ai/schemas/repair";
import { db } from "@/lib/db";
import { codeChanges, repairAttempts } from "@/lib/db/schema";

export type CodeEdit = CodeChange["edits"][number];

/** The generated edits followed by every accepted repair, in attempt order. */
export async function loadEffectiveEdits(
	workflowId: string,
): Promise<CodeEdit[]> {
	const [row] = await db
		.select()
		.from(codeChanges)
		.where(eq(codeChanges.workflowId, workflowId));
	if (!row) throw new Error("No generated changes found for this workflow");
	const base = CodeChangeSchema.safeParse(row.result);
	if (!base.success)
		throw new Error("Stored changes no longer match the current schema");

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

	const edits = [...base.data.edits];
	for (const r of repairs) {
		const parsed = RepairSchema.safeParse(r.result);
		if (!parsed.success) {
			throw new Error(
				`Stored repair attempt ${r.attemptNumber} no longer matches the current schema`,
			);
		}
		edits.push(...parsed.data.edits);
	}
	return edits;
}
