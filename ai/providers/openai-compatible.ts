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

export class OpenAICompatibleProvider implements AIProvider {
	constructor(
		readonly name: string,
		private apiKey: string,
		readonly model: string,
		private baseUrl: string,
		private strict = false,
	) {}

	async generateStructured(
		req: StructuredRequest,
	): Promise<StructuredResponse> {
		const started = Date.now();
		const res = await fetch(
			`${this.baseUrl.replace(/\/$/, "")}/chat/completions`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.apiKey}`,
				},
				body: JSON.stringify({
					model: this.model,
					messages: [
						{ role: "system", content: req.system },
						{ role: "user", content: req.user },
					],
					response_format: {
						type: "json_schema",
						json_schema: {
							name: req.schemaName,
							strict: this.strict,
							schema: req.jsonSchema,
						},
					},
					max_completion_tokens: 16000,
				}),
			},
		);

		const bodyText = await res.text();
		if (!res.ok) throw new Error(`${res.status} ${bodyText}`);

		const data = JSON.parse(bodyText) as ChatCompletion;
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
