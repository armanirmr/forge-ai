export type StructuredRequest = {
	system: string;
	user: string;
	schemaName: string;
	schemaDescription: string;
	jsonSchema: Record<string, unknown>;
};

export type StructuredResponse = {
	/** Unvalidated model output. Callers MUST validate before use. */
	raw: unknown;
	model: string;
	inputTokens: number | null;
	outputTokens: number | null;
	durationMs: number;
};

export interface AIProvider {
	readonly name: string;
	readonly model: string;
	generateStructured(req: StructuredRequest): Promise<StructuredResponse>;
}
