import { z } from "zod";

export const RequirementAnalysisInputSchema = z.object({
	requirement: z.string().min(10).max(4000),
	repository: z.object({
		owner: z.string(),
		name: z.string(),
		defaultBranch: z.string(),
		language: z.string().nullable(),
	}),
	fileTree: z.array(z.string()),
	fileTreeTotal: z.number().int(),
	snippets: z.array(
		z.object({
			path: z.string(),
			startLine: z.number().int(),
			endLine: z.number().int(),
			content: z.string(),
		}),
	),
});
export type RequirementAnalysisInput = z.infer<
	typeof RequirementAnalysisInputSchema
>;

export const RequirementAnalysisSchema = z.object({
	summary: z
		.string()
		.min(1)
		.describe("One or two sentences restating the requirement."),
	functionalRequirements: z
		.array(
			z.object({
				id: z.string().describe("Sequential ids: REQ-001, REQ-002, ..."),
				description: z.string().min(1),
				priority: z.enum(["high", "medium", "low"]),
				basis: z
					.enum(["explicit", "inferred"])
					.describe(
						"explicit = stated by the requester; inferred = your inference.",
					),
			}),
		)
		.min(1),
	nonFunctionalRequirements: z.array(z.string()),
	constraints: z.array(z.string()),
	assumptions: z.array(z.string()),
	risks: z.array(z.string()),
	acceptanceCriteria: z
		.array(z.string())
		.min(1)
		.describe("Each criterion must be testable."),
	affectedFiles: z
		.array(z.object({ path: z.string(), reason: z.string() }))
		.describe("ONLY paths that appear in the provided file tree."),
	openQuestions: z.array(z.string()),
});
export type RequirementAnalysis = z.infer<typeof RequirementAnalysisSchema>;
