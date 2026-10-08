export type TraceableEdit = { taskId: string; path: string };
export type TraceableTask = { id: string; title: string; requirementIds: string[] };
export type TraceableRequirement = { id: string; description: string };

export type RequirementTrace = {
	id: string;
	description: string | null;
	tasks: { id: string; title: string; paths: string[] }[];
};

export type UnmappedTaskEdits = { taskId: string; paths: string[] };

/** Links effective edits to requirements only through their validated implementation-plan task IDs. */
export function buildRequirementTrace(
	edits: TraceableEdit[],
	tasks: TraceableTask[],
	requirements: TraceableRequirement[],
): { requirements: RequirementTrace[]; unmappedTasks: UnmappedTaskEdits[] } {
	const taskById = new Map(tasks.map((task) => [task.id, task]));
	const requirementById = new Map(requirements.map((requirement) => [requirement.id, requirement]));
	const pathsByTask = new Map<string, Set<string>>();
	const unmappedPathsByTask = new Map<string, Set<string>>();

	for (const edit of edits) {
		const target = taskById.has(edit.taskId) ? pathsByTask : unmappedPathsByTask;
		const paths = target.get(edit.taskId) ?? new Set<string>();
		paths.add(edit.path);
		target.set(edit.taskId, paths);
	}

	const traces = new Map<string, Map<string, RequirementTrace["tasks"][number]>>();
	for (const [taskId, paths] of pathsByTask) {
		const task = taskById.get(taskId)!;
		for (const requirementId of task.requirementIds) {
			const taskTraces = traces.get(requirementId) ?? new Map();
			taskTraces.set(task.id, {
				id: task.id,
				title: task.title,
				paths: [...paths].sort(),
			});
			traces.set(requirementId, taskTraces);
		}
	}

	return {
		requirements: [...traces.entries()].map(([id, taskTraces]) => ({
			id,
			description: requirementById.get(id)?.description ?? null,
			tasks: [...taskTraces.values()],
		})),
		unmappedTasks: [...unmappedPathsByTask.entries()].map(([taskId, paths]) => ({
			taskId,
			paths: [...paths].sort(),
		})),
	};
}

/** Missing links make the review incomplete, so they cannot be approved as complete evidence. */
export function requirementTraceBlockers(
	trace: { requirements: RequirementTrace[]; unmappedTasks: UnmappedTaskEdits[] },
	canValidateRequirementIds: boolean,
): string[] {
	const blockers = trace.unmappedTasks.map(({ taskId, paths }) =>
		`Edits reference unknown plan task ${taskId} (${paths.join(", ")})`,
	);
	if (!canValidateRequirementIds && trace.requirements.length > 0) {
		blockers.push("Requirement analysis is missing or invalid; mapped requirement IDs cannot be verified");
	} else {
		for (const requirement of trace.requirements) {
			if (!requirement.description) blockers.push(`Plan task references unknown requirement ${requirement.id}`);
		}
	}
	return blockers;
}
