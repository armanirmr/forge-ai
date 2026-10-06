import { z } from "zod";
import {
	RequirementAnalysisInputSchema,
	RequirementAnalysisSchema,
} from "@/ai/schemas/requirement-analysis";

export const ImplementationPlanInputSchema =
	RequirementAnalysisInputSchema.extend({
		analysis: RequirementAnalysisSchema,
		/** Plain-language guidance from the human reviewer on a previous draft. */
		feedback: z.string().max(16000).optional(),
	});
export type ImplementationPlanInput = z.infer<
	typeof ImplementationPlanInputSchema
>;

export const PlanTaskSchema = z.object({
	id: z.string().describe("Sequential ids: TASK-001, TASK-002, ..."),
	title: z.string().min(1),
	description: z.string().min(1).describe("What to change and why. No code."),
	requirementIds: z
		.array(z.string())
		.min(1)
		.describe("REQ ids from the analysis that this task serves."),
	dependencies: z
		.array(z.string())
		.describe("Ids of EARLIER tasks in the list that must be finished first."),
	modifiesFiles: z
		.array(z.string())
		.describe(
			"Existing files to change. ONLY paths that appear in the file tree.",
		),
	createsFiles: z
		.array(z.string())
		.describe(
			"New files to create. Paths that do NOT appear in the file tree.",
		),
	acceptanceCriteria: z
		.array(z.string())
		.min(1)
		.describe("Each criterion must be testable."),
	risk: z.enum(["low", "medium", "high"]),
	estimatedComplexity: z.enum(["small", "medium", "large"]),
});

export const ImplementationPlanSchema = z.object({
	approach: z
		.string()
		.min(1)
		.describe("Two to four sentences describing the overall approach."),
	architectureNotes: z
		.array(z.string())
		.describe(
			"Observations about existing structure, grounded in the provided context.",
		),
	tasks: z.array(PlanTaskSchema).min(1).max(12),
	risks: z.array(z.string()),
	openQuestions: z.array(z.string()),
});
export type ImplementationPlan = z.infer<typeof ImplementationPlanSchema>;
