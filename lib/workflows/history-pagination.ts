export function normalizeWorkflowHistorySearch(value: string | undefined): string {
	return (value ?? "").trim().slice(0, 100);
}

export function escapeWorkflowHistorySearch(value: string): string {
	return value.replace(/[\\%_]/g, "\\$&");
}

export function workflowHistoryPageCount(total: number, pageSize: number): number {
	return Math.max(1, Math.ceil(total / pageSize));
}

export function resolveWorkflowHistoryPage(value: string | undefined, total: number, pageSize: number): number {
	const parsed = Number(value);
	const requested = Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
	return Math.min(requested, workflowHistoryPageCount(total, pageSize));
}
