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

// Patterns that mean a criterion talks about HTTP status codes.
const HTTP_STATUS_PATTERNS = [
	/\bhttp\s*[1-5]\d\d\b/i,
	/\b[1-5]\d\d\s+(?:status|error|response|code|forbidden|unauthorized|not found)\b/i,
	/\bstatus(?:\s+code)?\s*(?:of|is|=|:)?\s*[1-5]\d\d\b/i,
];

// Evidence that the repository context contains an HTTP layer.
const HTTP_LAYER_IN_CODE =
	/\b(NextResponse|NextRequest|express|fastify|koa|hono|createServer)\b|res\.status\(|new Response\(|\b(?:app|router)\.(?:get|post|put|patch|delete)\(/;
const HTTP_LAYER_IN_PATH =
	/(^|\/)(routes?|controllers?)\/|(^|\/)(pages|app)\/api\//;

function hasHttpLayer(input: ImplementationPlanInput): boolean {
	return (
		input.snippets.some((s) => HTTP_LAYER_IN_CODE.test(s.content)) ||
		input.fileTree.some((p) => HTTP_LAYER_IN_PATH.test(p))
	);
}

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
		const httpLayer = hasHttpLayer(input);

		output.tasks.forEach((t, i) => {
			if (!httpLayer) {
				const text = [t.description, ...t.acceptanceCriteria].join("\n");
				if (HTTP_STATUS_PATTERNS.some((p) => p.test(text))) {
					problems.push(
						`${t.id} mentions an HTTP status code, but no HTTP layer appears in the repository context. Describe the behaviour in terms of code that exists, such as a thrown error type`,
					);
				}
			}

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
