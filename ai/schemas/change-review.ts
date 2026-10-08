import { z } from "zod";
import { RequirementAnalysisInputSchema } from "@/ai/schemas/requirement-analysis";

const DiffLineSchema = z.object({
	type: z.enum([" ", "+", "-"]),
	text: z.string(),
});
const HunkSchema = z.object({
	oldStart: z.number().int(),
	newStart: z.number().int(),
	lines: z.array(DiffLineSchema),
});

export const ChangeReviewInputSchema = z.object({
	requirement: z.string().min(10).max(4000),
	repository: RequirementAnalysisInputSchema.shape.repository,
	requirements: z.array(
		z.object({
			id: z.string(),
			description: z.string(),
			basis: z.enum(["explicit", "inferred"]),
		}),
	),
	acceptanceCriteria: z
		.array(z.object({ id: z.string(), text: z.string() }))
		.min(1)
		.max(12),
	constraints: z.array(z.string()),
	tasks: z.array(
		z.object({
			id: z.string(),
			title: z.string(),
			modifiesFiles: z.array(z.string()),
			createsFiles: z.array(z.string()),
		}),
	),
	verification: z.object({
		status: z.string(),
		steps: z.array(
			z.object({
				name: z.string(),
				exitCode: z.number().int().nullable(),
				timedOut: z.boolean(),
			}),
		),
		skipped: z.array(z.object({ name: z.string(), reason: z.string() })),
	}),
	flags: z.array(
		z.object({ level: z.enum(["warn", "info"]), message: z.string() }),
	),
	repairCount: z.number().int().min(0),
	files: z.array(
		z.object({
			path: z.string(),
			isNew: z.boolean(),
			truncated: z.boolean(),
			hunks: z.array(HunkSchema),
		}),
	),
	omittedPaths: z.array(z.string()),
});
export type ChangeReviewInput = z.infer<typeof ChangeReviewInputSchema>;

const EvidenceSchema = z
	.string()
	.max(300)
	.nullable()
	.describe(
		"ONE line, or part of one line, copied verbatim from the diff without its leading marker and space. null only where the rules allow.",
	);

export const ChangeReviewSchema = z.object({
	summary: z
		.string()
		.min(1)
		.max(800)
		.describe(
			"Two or three sentences: what the change does and the main concern, if any.",
		),
	findings: z
		.array(
			z.object({
				severity: z.enum(["high", "medium", "low"]),
				category: z.enum([
					"requirement_gap",
					"unrequested_change",
					"test_gap",
					"bug_risk",
					"security",
					"consistency",
				]),
				path: z
					.string()
					.nullable()
					.describe("A changed file, or null if it concerns no single file."),
				criterionId: z
					.string()
					.nullable()
					.describe("An AC id from <acceptance_criteria>, or null."),
				title: z.string().min(1).max(160),
				detail: z.string().min(1).max(800),
				evidence: EvidenceSchema,
			}),
		)
		.max(8),
	criteriaCoverage: z
		.array(
			z.object({
				criterionId: z.string(),
				status: z.enum([
					"implemented_and_tested",
					"implemented_not_tested",
					"not_implemented",
					"unclear",
				]),
				evidence: EvidenceSchema,
				note: z.string().max(400),
			}),
		)
		.max(12),
});
export type ChangeReview = z.infer<typeof ChangeReviewSchema>;
