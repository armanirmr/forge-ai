import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userAISettings } from "@/lib/db/schema";
import { decryptUserCredential } from "@/lib/security/user-credentials";

export type ChatProviderName = "gemini" | "groq" | "openai" | "anthropic";

export type EffectiveAISettings = {
	provider: ChatProviderName;
	model: string;
	apiKey: string;
	embeddingApiKey?: string;
	baseUrl?: string;
	strictSchema: boolean;
};

function configuredProvider(value: string | undefined): ChatProviderName {
	if (value === "gemini" || value === "groq" || value === "openai" || value === "anthropic") return value;
	if (!value) throw new Error("Choose a supported chat provider in Settings.");
	throw new Error(`Unsupported AI provider "${value}". Choose Gemini, Groq, OpenAI, or Anthropic in Settings.`);
}

/** Account settings override server defaults. Credentials are decrypted only for provider calls. */
export async function getEffectiveAISettings(userId?: string): Promise<EffectiveAISettings> {
	if (userId) {
		const [saved] = await db
			.select({
				provider: userAISettings.provider,
				model: userAISettings.model,
				encryptedApiKey: userAISettings.encryptedApiKey,
				encryptedEmbeddingApiKey: userAISettings.encryptedEmbeddingApiKey,
			})
			.from(userAISettings)
			.where(eq(userAISettings.userId, userId));
		if (saved) {
			return {
				provider: configuredProvider(saved.provider),
				model: saved.model,
				apiKey: decryptUserCredential(userId, saved.encryptedApiKey),
				embeddingApiKey: saved.encryptedEmbeddingApiKey
					? decryptUserCredential(userId, saved.encryptedEmbeddingApiKey)
					: undefined,
				baseUrl: process.env.AI_BASE_URL,
				strictSchema: process.env.AI_STRICT_SCHEMA !== "false",
			};
		}
	}

	const provider = configuredProvider(process.env.AI_PROVIDER);
	const apiKey = process.env.AI_API_KEY;
	const model = process.env.AI_MODEL;
	if (!apiKey || !model) {
		throw new Error("Add an AI provider key and model in Settings, or configure AI_PROVIDER, AI_API_KEY, and AI_MODEL on the server.");
	}
	return {
		provider,
		model,
		apiKey,
		embeddingApiKey: process.env.EMBEDDING_API_KEY ?? (provider === "gemini" ? apiKey : undefined),
		baseUrl: process.env.AI_BASE_URL,
		strictSchema: process.env.AI_STRICT_SCHEMA !== "false",
	};
}

/** Gemini Embedding 2 remains the embedding backend, independent of chat provider choice. */
export async function getEmbeddingApiKey(userId?: string): Promise<string> {
	if (userId) {
		const [saved] = await db
			.select({
				provider: userAISettings.provider,
				encryptedApiKey: userAISettings.encryptedApiKey,
				encryptedEmbeddingApiKey: userAISettings.encryptedEmbeddingApiKey,
			})
			.from(userAISettings)
			.where(eq(userAISettings.userId, userId));
		if (saved?.encryptedEmbeddingApiKey) {
			return decryptUserCredential(userId, saved.encryptedEmbeddingApiKey);
		}
		if (saved?.provider === "gemini") {
			return decryptUserCredential(userId, saved.encryptedApiKey);
		}
	}

	const key = process.env.EMBEDDING_API_KEY ??
		(process.env.AI_PROVIDER === "gemini" ? process.env.AI_API_KEY : undefined);
	if (!key) {
		throw new Error("Add a Google AI Studio key for Gemini Embedding 2 in Settings to import and search repositories.");
	}
	return key;
}
