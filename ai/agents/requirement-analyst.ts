import {
	REQUIREMENT_ANALYSIS_PROMPT_VERSION,
	REQUIREMENT_ANALYSIS_SYSTEM_PROMPT,
	buildRequirementAnalysisMessage,
} from "@/ai/prompts/requirement-analysis";
import {
	RequirementAnalysisInputSchema,
	RequirementAnalysisSchema,
	type RequirementAnalysis,
	type RequirementAnalysisInput,
} from "@/ai/schemas/requirement-analysis";
import type { AgentDefinition } from "./types";

export const requirementAnalyst: AgentDefinition<
	RequirementAnalysisInput,
	RequirementAnalysis
> = {
	name: "requirement-analyst",
	purpose: "Submit the structured requirement analysis.",
	schemaName: "submit_requirement_analysis",
	promptVersion: REQUIREMENT_ANALYSIS_PROMPT_VERSION,
	systemPrompt: REQUIREMENT_ANALYSIS_SYSTEM_PROMPT,
	inputSchema: RequirementAnalysisInputSchema,
	outputSchema: RequirementAnalysisSchema,
	buildUserMessage: buildRequirementAnalysisMessage,
	semanticChecks(input, output) {
		const problems: string[] = [];
		const known = new Set(input.fileTree);
		const invented = output.affectedFiles
			.map((f) => f.path)
			.filter((p) => !known.has(p));
		if (invented.length > 0) {
			problems.push(
				`affectedFiles contains paths that are not in the file tree: ${invented.join(", ")}`,
			);
		}
		const ids = output.functionalRequirements.map((r) => r.id);
		if (new Set(ids).size !== ids.length)
			problems.push("Duplicate functional requirement ids");
		return problems;
	},
};
