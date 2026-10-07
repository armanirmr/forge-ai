import { afterEach, describe, expect, it, vi } from "vitest";
import {
	OpenAICompatibleProvider,
	parseRetryAfterMs,
} from "./openai-compatible";

const req = {
	system: "sys",
	user: "usr",
	schemaName: "s",
	schemaDescription: "d",
	jsonSchema: { type: "object" },
};

function reply(status: number, body: unknown) {
	return {
		ok: status >= 200 && status < 300,
		status,
		text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
	};
}
const success = (content: string) =>
	reply(200, {
		model: "m",
		choices: [{ message: { content } }],
		usage: { prompt_tokens: 1, completion_tokens: 2 },
	});
const jsonFail = () =>
	reply(400, { error: { code: "json_validate_failed", message: "x" } });

const sentBody = (fetchMock: ReturnType<typeof vi.fn>, call: number) =>
	JSON.parse(fetchMock.mock.calls[call][1].body as string);

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe("parseRetryAfterMs", () => {
	it("reads seconds and milliseconds, or returns null", () => {
		expect(parseRetryAfterMs("Please try again in 5.7525s.")).toBe(5753);
		expect(parseRetryAfterMs("try again in 350ms")).toBe(350);
		expect(parseRetryAfterMs("no hint here")).toBeNull();
	});
});

describe("OpenAICompatibleProvider", () => {
	it("sends low reasoning effort only for Groq gpt-oss models", async () => {
		const fetchMock = vi.fn().mockResolvedValue(success('{"a":1}'));
		vi.stubGlobal("fetch", fetchMock);

		await new OpenAICompatibleProvider(
			"groq",
			"k",
			"openai/gpt-oss-20b",
			"https://x/v1",
		).generateStructured(req);
		await new OpenAICompatibleProvider(
			"other",
			"k",
			"openai/gpt-oss-20b",
			"https://x/v1",
		).generateStructured(req);

		expect(sentBody(fetchMock, 0).reasoning_effort).toBe("medium");
		expect(sentBody(fetchMock, 1).reasoning_effort).toBeUndefined();
	});

	it("falls back once to json_object mode with the schema in the prompt", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonFail())
			.mockResolvedValueOnce(success('{"a":1}'));
		vi.stubGlobal("fetch", fetchMock);

		const res = await new OpenAICompatibleProvider(
			"groq",
			"k",
			"m",
			"https://x/v1",
		).generateStructured(req);

		expect(res.raw).toEqual({ a: 1 });
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(sentBody(fetchMock, 1).response_format.type).toBe("json_object");
		expect(sentBody(fetchMock, 1).messages[0].content).toContain(
			'"type":"object"',
		);
	});

	it("does not fall back a second time", async () => {
		const fetchMock = vi.fn().mockImplementation(async () => jsonFail());
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			new OpenAICompatibleProvider(
				"groq",
				"k",
				"m",
				"https://x/v1",
			).generateStructured(req),
		).rejects.toThrow(/json_validate_failed/);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("waits out a short rate-limit hint and retries once", async () => {
		vi.useFakeTimers();
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(reply(429, "Rate limit. Please try again in 2s."))
			.mockResolvedValueOnce(success('{"a":1}'));
		vi.stubGlobal("fetch", fetchMock);

		const p = new OpenAICompatibleProvider(
			"groq",
			"k",
			"m",
			"https://x/v1",
		).generateStructured(req);
		await vi.advanceTimersByTimeAsync(3000);

		await expect(p).resolves.toMatchObject({ raw: { a: 1 } });
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("surfaces long rate-limit waits instead of sleeping", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(reply(429, "Rate limit. Please try again in 60s."));
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			new OpenAICompatibleProvider(
				"groq",
				"k",
				"m",
				"https://x/v1",
			).generateStructured(req),
		).rejects.toThrow(/^429/);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
