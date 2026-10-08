import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider, StructuredRequest, StructuredResponse } from "./types";

export class AnthropicProvider implements AIProvider {
	readonly name = "anthropic";
	private client: Anthropic;

	constructor(apiKey: string, readonly model: string) {
		this.client = new Anthropic({ apiKey });
	}

	async generateStructured(req: StructuredRequest): Promise<StructuredResponse> {
		const started = Date.now();
		const response = await this.client.messages.create({
			model: this.model,
			max_tokens: 16000,
			system: req.system,
			messages: [{ role: "user", content: req.user }],
			output_config: {
				format: {
					type: "json_schema",
					schema: req.jsonSchema,
				},
			},
		});
		const text = response.content
			.filter((block) => block.type === "text")
			.map((block) => block.text)
			.join("");
		if (!text) throw new Error("Anthropic returned an empty structured response");

		let raw: unknown = text;
		try {
			raw = JSON.parse(text);
		} catch {
			/* runAgent performs the authoritative schema validation and retry. */
		}
		return {
			raw,
			model: response.model ?? this.model,
			inputTokens: response.usage.input_tokens,
			outputTokens: response.usage.output_tokens,
			durationMs: Date.now() - started,
		};
	}
}
