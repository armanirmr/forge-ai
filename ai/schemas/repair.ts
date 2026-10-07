import { z } from "zod";
import { CodeEditSchema } from "@/ai/schemas/code-generation";
import { ImplementationPlanSchema } from "@/ai/schemas/implementation-plan";
import { RequirementAnalysisInputSchema } from "@/ai/schemas/requirement-analysis";

const FileSchema = z.object({ path: z.string(), content: z.string() });

export const RepairInputSchema = z.object({
	requirement: z.string().min(10).max(4000),
	repository: RequirementAnalysisInputSchema.shape.repository,
	plan: ImplementationPlanSchema,
	attemptNumber: z.number().int().min(1),
	maxAttempts: z.number().int().min(1),
	failures: z
		.array(
			z.object({
				step: z.string(),
				command: z.string(),
				exitCode: z.number().int().nullable(),
				timedOut: z.boolean(),
				output: z.string(),
			}),
		)
		.min(1),
	previousAttempts: z.array(
		z.object({
			attemptNumber: z.number().int(),
			outcome: z.string(),
			rootCause: z.string().nullable(),
			summary: z.string().nullable(),
		}),
	),
	/** The plan's files exactly as they are now, after all edits so far. */
	editableFiles: z.array(FileSchema),
	/** Read-only files mentioned in the failure output. */
	referenceFiles: z.array(FileSchema),
});
export type RepairInput = z.infer<typeof RepairInputSchema>;

export const RepairSchema = z.object({
	rootCause: z
		.string()
		.min(1)
		.describe(
			"What failed and why, grounded in the failure output. Quote the evidence.",
		),
	summary: z
		.string()
		.min(1)
		.describe("One or two sentences describing the fix."),
	cannotFixReason: z
		.string()
		.nullable()
		.describe(
			"null when you propose a fix. Otherwise why no safe fix is possible within the plan's files. Then edits must be empty.",
		),
	edits: z.array(CodeEditSchema).max(10),
	notes: z.array(z.string()),
});
export type Repair = z.infer<typeof RepairSchema>;
