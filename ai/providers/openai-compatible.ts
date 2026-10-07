import type {
	AIProvider,
	StructuredRequest,
	StructuredResponse,
} from "./types";

type ChatCompletion = {
	model?: string;
	choices?: { message?: { content?: string | null } }[];
	usage?: { prompt_tokens?: number; completion_tokens?: number };
};

type Mode = "schema" | "json_object";

const MAX_RATE_LIMIT_WAIT_MS = 15_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Parses Groq-style hints: "Please try again in 5.7525s" or "...in 350ms". */
export function parseRetryAfterMs(body: string): number | null {
	const m = body.match(/try again in ([\d.]+)\s*(ms|s)\b/i);
	if (!m) return null;
	const value = parseFloat(m[1]);
	return Math.ceil(m[2].toLowerCase() === "ms" ? value : value * 1000);
}

export function isJsonValidationFailure(status: number, body: string): boolean {
	return status === 400 && body.includes("json_validate_failed");
}

export class OpenAICompatibleProvider implements AIProvider {
	constructor(
		readonly name: string,
		private apiKey: string,
		readonly model: string,
		private baseUrl: string,
		private strict = false,
	) {}

	/** Groq's gpt-oss models spend output tokens on hidden reasoning; keep it low. */
	private usesLowReasoning(): boolean {
		return this.name === "groq" && /gpt-oss/i.test(this.model);
	}

	private buildBody(req: StructuredRequest, mode: Mode) {
		const system =
			mode === "schema"
				? req.system
				: `${req.system}\n\nRespond with a single JSON object and nothing else. ` +
					`It must conform to this JSON Schema:\n${JSON.stringify(req.jsonSchema)}`;

		return {
			model: this.model,
			messages: [
				{ role: "system", content: system },
				{ role: "user", content: req.user },
			],
			response_format:
				mode === "schema"
					? {
							type: "json_schema",
							json_schema: {
								name: req.schemaName,
								strict: this.strict,
								schema: req.jsonSchema,
							},
						}
					: { type: "json_object" },
			max_completion_tokens: 16000,
			...(this.usesLowReasoning() ? { reasoning_effort: "medium" } : {}),
		};
	}

	/** One POST. A single short rate-limit wait is honored; longer ones are surfaced as errors. */
	private async post(
		body: unknown,
	): Promise<{ ok: boolean; status: number; text: string }> {
		for (let attempt = 0; ; attempt++) {
			const res = await fetch(
				`${this.baseUrl.replace(/\/$/, "")}/chat/completions`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${this.apiKey}`,
					},
					body: JSON.stringify(body),
				},
			);
			const text = await res.text();

			if (res.status === 429 && attempt === 0) {
				const wait = parseRetryAfterMs(text);
				if (wait !== null && wait <= MAX_RATE_LIMIT_WAIT_MS) {
					await sleep(wait + 500);
					continue;
				}
			}
			return { ok: res.ok, status: res.status, text };
		}
	}

	async generateStructured(
		req: StructuredRequest,
	): Promise<StructuredResponse> {
		const started = Date.now();

		let result = await this.post(this.buildBody(req, "schema"));

		// Some providers reject or fail strict schema generation. Retry ONCE in plain
		// JSON mode with the schema in the prompt; our own validation is the real gate.
		if (!result.ok && isJsonValidationFailure(result.status, result.text)) {
			result = await this.post(this.buildBody(req, "json_object"));
		}

		if (!result.ok) throw new Error(`${result.status} ${result.text}`);

		const data = JSON.parse(result.text) as ChatCompletion;
		const text = data.choices?.[0]?.message?.content;
		if (!text) throw new Error("Model returned an empty response");

		// Invalid JSON is passed through as a string so schema validation can reject it and trigger the repair attempt.
		let raw: unknown = text;
		try {
			raw = JSON.parse(text);
		} catch {
			/* handled by validation */
		}

		return {
			raw,
			model: data.model ?? this.model,
			inputTokens: data.usage?.prompt_tokens ?? null,
			outputTokens: data.usage?.completion_tokens ?? null,
			durationMs: Date.now() - started,
		};
	}
}
