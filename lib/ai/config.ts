import { GeminiProvider } from "@/ai/providers/gemini";
import { OpenAICompatibleProvider } from "@/ai/providers/openai-compatible";
import type { AIProvider } from "@/ai/providers/types";

export function getProvider(): AIProvider {
	const name = process.env.AI_PROVIDER;
	if (!name) throw new Error("AI_PROVIDER is not set in .env.local");
	const apiKey = process.env.AI_API_KEY;
	if (!apiKey) throw new Error("AI_API_KEY is not set in .env.local");
	const model = process.env.AI_MODEL;
	if (!model) throw new Error("AI_MODEL is not set in .env.local");

	switch (name) {
		case "gemini":
			return new GeminiProvider(apiKey, model);
		case "groq":
			return new OpenAICompatibleProvider(
				"groq",
				apiKey,
				model,
				process.env.AI_BASE_URL ?? "https://api.groq.com/openai/v1",
				process.env.AI_STRICT_SCHEMA !== "false",
			);
		default:
			throw new Error(`Unsupported AI_PROVIDER: ${name}`);
	}
}
