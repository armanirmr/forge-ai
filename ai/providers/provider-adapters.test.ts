import { afterEach, describe, expect, it, vi } from "vitest";
import { AnthropicProvider } from "./anthropic";
import { OpenAICompatibleProvider } from "./openai-compatible";
import type { StructuredRequest } from "./types";

const request: StructuredRequest = {
	system: "Return structured JSON.",
	user: "Answer the request.",
	schemaName: "test_result",
	schemaDescription: "A test response.",
	jsonSchema: {
		type: "object",
		properties: { answer: { type: "string" } },
		required: ["answer"],
		additionalProperties: false,
	},
};

afterEach(() => vi.unstubAllGlobals());

describe("OpenAI-compatible provider", () => {
	it("sends structured output to the configured OpenAI-compatible endpoint", async () => {
		let capturedUrl = "";
		let capturedBody: Record<string, unknown> | undefined;
		const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
			capturedUrl = String(input);
			capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
			return new Response(JSON.stringify({
				model: "test-model",
				choices: [{ message: { content: JSON.stringify({ answer: "ok" }) } }],
				usage: { prompt_tokens: 12, completion_tokens: 3 },
			}), { status: 200, headers: { "content-type": "application/json" } });
		});
		vi.stubGlobal("fetch", fetchMock);

		const provider = new OpenAICompatibleProvider(
			"openai", "test-key", "test-model", "https://api.openai.com/v1", true,
		);
		const result = await provider.generateStructured(request);

		expect(capturedUrl).toBe("https://api.openai.com/v1/chat/completions");
		expect((capturedBody?.response_format as { type: string }).type).toBe("json_schema");
		expect(result).toMatchObject({
			raw: { answer: "ok" },
			model: "test-model",
			inputTokens: 12,
			outputTokens: 3,
		});
	});
});

describe("Anthropic provider", () => {
	it("sends the output schema to Messages API and parses its JSON response", async () => {
		let capturedUrl = "";
		let capturedBody: Record<string, unknown> | undefined;
		const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
			capturedUrl = String(input);
			capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
			return new Response(JSON.stringify({
				id: "msg_test",
				type: "message",
				role: "assistant",
				model: "claude-sonnet-test",
				content: [{ type: "text", text: JSON.stringify({ answer: "ok" }) }],
				stop_reason: "end_turn",
				stop_sequence: null,
				usage: { input_tokens: 14, output_tokens: 4 },
			}), { status: 200, headers: { "content-type": "application/json" } });
		});
		vi.stubGlobal("fetch", fetchMock);

		const provider = new AnthropicProvider("test-key", "claude-sonnet-test");
		const result = await provider.generateStructured(request);

		expect(capturedUrl).toContain("/v1/messages");
		expect((capturedBody?.output_config as { format: { schema: unknown } }).format.schema).toEqual(request.jsonSchema);
		expect(result).toMatchObject({
			raw: { answer: "ok" },
			model: "claude-sonnet-test",
			inputTokens: 14,
			outputTokens: 4,
		});
	});
});
