import { z } from "zod";

export const VERIFY_STALE_MS = 15 * 60 * 1000;

/** True when a "verifying" workflow has been stuck long enough to be retried. */
export function isVerificationStale(
	updatedAt: Date,
	now: number = Date.now(),
): boolean {
	return now - updatedAt.getTime() > VERIFY_STALE_MS;
}

export const StepResultSchema = z.object({
	name: z.string(),
	command: z.string(),
	exitCode: z.number().int().nullable(),
	timedOut: z.boolean(),
	durationMs: z.number().int(),
	output: z.string(),
});
export type StepResult = z.infer<typeof StepResultSchema>;

export const VerificationStatusSchema = z.enum([
	"passed",
	"failed",
	"error",
	"not_executed",
]);

export const VerificationResultSchema = z.object({
	status: VerificationStatusSchema,
	message: z.string().nullable(),
	image: z.string(),
	steps: z.array(StepResultSchema),
	skipped: z.array(z.object({ name: z.string(), reason: z.string() })),
	notes: z.array(z.string()),
	cleanupOk: z.boolean(),
});
export type VerificationResult = z.infer<typeof VerificationResultSchema>;
