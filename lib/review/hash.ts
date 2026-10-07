import { createHash } from "node:crypto";

/** Identifies the exact edits a decision applies to. Order matters. */
export function hashEdits(
	edits: { taskId: string; path: string; search: string; replace: string }[],
): string {
	const canonical = JSON.stringify(
		edits.map((e) => [e.taskId, e.path, e.search, e.replace]),
	);
	return createHash("sha256").update(canonical).digest("hex");
}
