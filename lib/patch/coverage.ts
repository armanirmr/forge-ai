export type PlanTaskLike = {
	id: string;
	modifiesFiles: string[];
	createsFiles: string[];
};

export type EditLike = {
	path: string;
	taskId: string;
	search: string;
};

/**
 * Lists plan items that have no matching edit. A task that lists a file but
 * produces no edit for it means the generation is incomplete, even if every
 * edit that WAS produced is valid.
 */
export function findMissingCoverage(
	tasks: PlanTaskLike[],
	edits: EditLike[],
): string[] {
	const problems: string[] = [];

	for (const task of tasks) {
		for (const path of new Set(task.modifiesFiles)) {
			const covered = edits.some(
				(e) => e.taskId === task.id && e.path === path && e.search !== "",
			);
			if (!covered) {
				problems.push(
					`No edit for ${path} (${task.id}): the plan modifies this file`,
				);
			}
		}
		for (const path of new Set(task.createsFiles)) {
			const covered = edits.some(
				(e) => e.taskId === task.id && e.path === path && e.search === "",
			);
			if (!covered) {
				problems.push(
					`No new-file edit for ${path} (${task.id}): the plan creates this file`,
				);
			}
		}
	}

	return problems;
}
