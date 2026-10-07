export type ScopeTask = {
	id: string;
	modifiesFiles: string[];
	createsFiles: string[];
};
export type ScopeEdit = { taskId: string; path: string; search: string };

/** An edit may only touch files listed on its own task. */
export function findScopeProblems(
	tasks: ScopeTask[],
	edits: ScopeEdit[],
): string[] {
	const byId = new Map(tasks.map((t) => [t.id, t]));
	const problems: string[] = [];
	edits.forEach((e, i) => {
		const label = `edit ${i + 1} (${e.path})`;
		const task = byId.get(e.taskId);
		if (!task) {
			problems.push(`${label}: unknown task ${e.taskId}`);
			return;
		}
		const allowed =
			e.search === ""
				? task.createsFiles
				: [...task.modifiesFiles, ...task.createsFiles];
		if (!allowed.includes(e.path)) {
			problems.push(`${label}: path is outside the scope of ${e.taskId}`);
		}
	});
	return problems;
}
