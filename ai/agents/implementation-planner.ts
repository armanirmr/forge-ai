import {
	IMPLEMENTATION_PLANNING_PROMPT_VERSION,
	IMPLEMENTATION_PLANNING_SYSTEM_PROMPT,
	buildImplementationPlanningMessage,
} from "@/ai/prompts/implementation-planning";
import {
	ImplementationPlanInputSchema,
	ImplementationPlanSchema,
	type ImplementationPlan,
	type ImplementationPlanInput,
} from "@/ai/schemas/implementation-plan";
import type { AgentDefinition } from "./types";

export const implementationPlanner: AgentDefinition<
	ImplementationPlanInput,
	ImplementationPlan
> = {
	name: "implementation-planner",
	purpose: "Submit the structured implementation plan.",
	schemaName: "submit_implementation_plan",
	promptVersion: IMPLEMENTATION_PLANNING_PROMPT_VERSION,
	systemPrompt: IMPLEMENTATION_PLANNING_SYSTEM_PROMPT,
	inputSchema: ImplementationPlanInputSchema,
	outputSchema: ImplementationPlanSchema,
	buildUserMessage: buildImplementationPlanningMessage,
	semanticChecks(input, output) {
		const problems: string[] = [];
		const tree = new Set(input.fileTree);
		const reqIds = new Set(
			input.analysis.functionalRequirements.map((r) => r.id),
		);
		const ids = output.tasks.map((t) => t.id);
		if (new Set(ids).size !== ids.length) problems.push("Duplicate task ids");

		const position = new Map(ids.map((id, i) => [id, i]));
		const covered = new Set<string>();

		output.tasks.forEach((t, i) => {
			for (const d of t.dependencies) {
				const p = position.get(d);
				if (p === undefined)
					problems.push(`${t.id} depends on unknown task ${d}`);
				else if (p >= i)
					problems.push(
						`${t.id} depends on ${d}, which is not listed before it`,
					);
			}
			for (const f of t.modifiesFiles) {
				if (!tree.has(f))
					problems.push(
						`${t.id} modifies a path that is not in the file tree: ${f}`,
					);
			}
			for (const f of t.createsFiles) {
				if (tree.has(f))
					problems.push(
						`${t.id} creates ${f}, which already exists; list it under modifiesFiles`,
					);
			}
			for (const r of t.requirementIds) {
				if (!reqIds.has(r))
					problems.push(`${t.id} references unknown requirement ${r}`);
				else covered.add(r);
			}
		});

		for (const r of reqIds) {
			if (!covered.has(r))
				problems.push(`Requirement ${r} is not covered by any task`);
		}
		return problems;
	},
};
