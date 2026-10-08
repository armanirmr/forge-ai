import { GeminiProvider } from "@/ai/providers/gemini";
import { AnthropicProvider } from "@/ai/providers/anthropic";
import { OpenAICompatibleProvider } from "@/ai/providers/openai-compatible";
import type { AIProvider } from "@/ai/providers/types";
import { paceProvider } from "@/lib/ai/pacing";
import { getEffectiveAISettings } from "@/lib/ai/user-settings";

async function createBaseProvider(userId: string): Promise<AIProvider> {
	const settings = await getEffectiveAISettings(userId);
	switch (settings.provider) {
		case "gemini":
			return new GeminiProvider(settings.apiKey, settings.model);
		case "groq":
			return new OpenAICompatibleProvider(
				"groq",
				settings.apiKey,
				settings.model,
				settings.baseUrl ?? "https://api.groq.com/openai/v1",
				settings.strictSchema,
			);
		case "openai":
			return new OpenAICompatibleProvider(
				"openai",
				settings.apiKey,
				settings.model,
				"https://api.openai.com/v1",
				settings.strictSchema,
			);
		case "anthropic":
			return new AnthropicProvider(settings.apiKey, settings.model);
	}
}

/** Every caller gets a provider wrapped with the rate limiter. */
export async function getProvider(userId: string): Promise<AIProvider> {
	return paceProvider(await createBaseProvider(userId));
}
