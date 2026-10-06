import { z } from "zod";
import { ImplementationPlanSchema } from "@/ai/schemas/implementation-plan";
import {
	RequirementAnalysisInputSchema,
	RequirementAnalysisSchema,
} from "@/ai/schemas/requirement-analysis";

const FileSchema = z.object({ path: z.string(), content: z.string() });

export const CodeGenerationInputSchema = z.object({
	requirement: z.string().min(10).max(4000),
	repository: RequirementAnalysisInputSchema.shape.repository,
	fileTree: z.array(z.string()),
	analysis: RequirementAnalysisSchema,
	plan: ImplementationPlanSchema,
	/** Existing files the plan modifies. Edits may target these. */
	editableFiles: z.array(FileSchema),
	/** Read-only context (for example sibling files, to match conventions). */
	referenceFiles: z.array(FileSchema),
});
export type CodeGenerationInput = z.infer<typeof CodeGenerationInputSchema>;

export const CodeEditSchema = z.object({
	taskId: z
		.string()
		.describe("The plan task this edit implements, for example TASK-001."),
	path: z.string(),
	search: z
		.string()
		.describe(
			"Exact text to replace, copied verbatim from the file. Must appear exactly once at that point. Use an empty string to create a new file.",
		),
	replace: z
		.string()
		.describe("The replacement text, or the full content of a new file."),
});

export const CodeChangeSchema = z.object({
	summary: z.string().min(1),
	edits: z.array(CodeEditSchema).min(1).max(30),
	notes: z
		.array(z.string())
		.describe(
			"Assumptions, caveats, or plan items you could not fully implement.",
		),
});
export type CodeChange = z.infer<typeof CodeChangeSchema>;
