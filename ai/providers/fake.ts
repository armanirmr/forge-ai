import type {
	AIProvider,
	StructuredRequest,
	StructuredResponse,
} from "./types";

export class FakeProvider implements AIProvider {
	readonly name = "fake";
	readonly model = "fake-model";
	readonly requests: StructuredRequest[] = [];

	constructor(private responses: unknown[]) {}

	async generateStructured(
		req: StructuredRequest,
	): Promise<StructuredResponse> {
		this.requests.push(req);
		if (this.responses.length === 0)
			throw new Error("FakeProvider: no response queued");
		const next = this.responses.shift();
		if (next instanceof Error) throw next;
		return {
			raw: next,
			model: this.model,
			inputTokens: 10,
			outputTokens: 5,
			durationMs: 1,
		};
	}
}
