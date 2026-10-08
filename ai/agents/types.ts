import type { z } from "zod";

export type AgentDefinition<I, O> = {
	name: string;
	purpose: string;
	/** Name of the structured-output schema the model must fill in. */
	schemaName: string;
	/** Bump on EVERY prompt change; recorded in ai_runs. */
	promptVersion: string;
	systemPrompt: string;
	inputSchema: z.ZodType<I>;
	outputSchema: z.ZodType<O>;
	buildUserMessage(input: I): string;
	/** Deterministic cleanup applied before semantic validation and persistence. */
	normalizeOutput?(input: I, output: O): O;
	/** Checks a schema can't express. Return a list of problems (empty = OK). */
	semanticChecks?(input: I, output: O): string[];
};
