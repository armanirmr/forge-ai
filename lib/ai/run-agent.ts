import { z } from "zod";
import type { AgentDefinition } from "@/ai/agents/types";
import type { AIProvider } from "@/ai/providers/types";

export type AttemptRecord = {
	status: "succeeded" | "validation_failed" | "failed";
	model: string;
	inputTokens: number | null;
	outputTokens: number | null;
	durationMs: number;
	error?: string;
};

export type AgentResult<O> =
	| { ok: true; output: O; attempts: AttemptRecord[] }
	| { ok: false; error: string; attempts: AttemptRecord[] };

export type RunAgentOptions = {
	/** Output-validation attempts (schema/semantic repair). */
	maxAttempts?: number;
	/** Waits before each retry of a TRANSIENT provider error. Length = max retries. */
	transientRetryDelaysMs?: number[];
};

function formatIssues(err: z.ZodError): string {
	return err.issues
		.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
		.join("; ");
}

function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
	const js = { ...(z.toJSONSchema(schema) as Record<string, unknown>) };
	delete js.$schema;
	return js;
}

/** Overload / rate-limit style errors worth a short, bounded retry. */
export function isTransientProviderError(message: string): boolean {
	return /\b(503|429)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand|json_validate_failed/i.test(
		message,
	);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Reads "try again in 5.73s" or "224.99ms" from a rate-limit message. Null if absent. */
export function parseRetryAfterMs(message: string): number | null {
	const m = /try again in\s+([\d.]+)\s*(ms|s)\b/i.exec(message);
	if (!m) return null;
	const value = Number(m[1]);
	if (!Number.isFinite(value)) return null;
	return Math.round(m[2].toLowerCase() === "ms" ? value : value * 1000);
}

const MAX_RATE_LIMIT_WAIT_MS = 40_000;

function transientWaitMs(message: string, fallbackMs: number): number {
	const hinted = parseRetryAfterMs(message);
	if (hinted === null) return fallbackMs;
	return Math.min(Math.max(hinted + 500, fallbackMs), MAX_RATE_LIMIT_WAIT_MS);
}

export async function runAgent<I, O>(
	def: AgentDefinition<I, O>,
	rawInput: unknown,
	provider: AIProvider,
	{
		maxAttempts = 2,
		transientRetryDelaysMs = [2000, 5000, 10000, 20000],
	}: RunAgentOptions = {},
): Promise<AgentResult<O>> {
	const parsedInput = def.inputSchema.safeParse(rawInput);
	if (!parsedInput.success) {
		return {
			ok: false,
			error: `Invalid agent input: ${formatIssues(parsedInput.error)}`,
			attempts: [],
		};
	}
	const input = parsedInput.data;
	const jsonSchema = toJsonSchema(def.outputSchema);
	const baseMessage = def.buildUserMessage(input);

	const attempts: AttemptRecord[] = [];
	let user = baseMessage;
	let lastError = "";
	let validationAttempts = 0;
	let transientRetries = 0;

	while (validationAttempts < maxAttempts) {
		const started = Date.now();
		let res;
		try {
			res = await provider.generateStructured({
				system: def.systemPrompt,
				user,
				schemaName: def.schemaName,
				schemaDescription: def.purpose,
				jsonSchema,
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			attempts.push({
				status: "failed",
				model: provider.model,
				inputTokens: null,
				outputTokens: null,
				durationMs: Date.now() - started,
				error: message,
			});
			if (
				isTransientProviderError(message) &&
				transientRetries < transientRetryDelaysMs.length
			) {
				await sleep(
					transientWaitMs(message, transientRetryDelaysMs[transientRetries]),
				);
				transientRetries += 1;
				continue;
			}
			return { ok: false, error: `Provider error: ${message}`, attempts };
		}

		validationAttempts += 1;
		const parsed = def.outputSchema.safeParse(res.raw);
		const problems = parsed.success
			? (def.semanticChecks?.(input, parsed.data) ?? [])
			: [formatIssues(parsed.error)];

		const usage = {
			model: res.model,
			inputTokens: res.inputTokens,
			outputTokens: res.outputTokens,
			durationMs: res.durationMs,
		};

		if (parsed.success && problems.length === 0) {
			attempts.push({ status: "succeeded", ...usage });
			return { ok: true, output: parsed.data, attempts };
		}

		lastError = problems.join("; ");
		attempts.push({ status: "validation_failed", ...usage, error: lastError });
		user =
			`${baseMessage}\n\n<previous_attempt_rejected>\n${lastError}\n</previous_attempt_rejected>\n` +
			`Your previous output was rejected for the reasons above. Produce a corrected result.`;
	}

	return {
		ok: false,
		error: `Output failed validation after ${maxAttempts} attempts: ${lastError}`,
		attempts,
	};
}
