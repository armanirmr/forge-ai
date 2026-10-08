import "server-only";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { userAISettings } from "@/lib/db/schema";
import { evaluateAISetupStatus } from "./setup-readiness";

export async function getAISetupStatus(userId: string) {
	const [saved] = await db
		.select({
			provider: userAISettings.provider,
			encryptedApiKey: userAISettings.encryptedApiKey,
			encryptedEmbeddingApiKey: userAISettings.encryptedEmbeddingApiKey,
		})
		.from(userAISettings)
		.where(eq(userAISettings.userId, userId));
	return evaluateAISetupStatus(
		saved
			? {
					provider: saved.provider,
					hasChatKey: Boolean(saved.encryptedApiKey),
					hasEmbeddingKey: Boolean(saved.encryptedEmbeddingApiKey),
				}
			: null,
		{
			AI_PROVIDER: process.env.AI_PROVIDER,
			AI_API_KEY: process.env.AI_API_KEY,
			AI_MODEL: process.env.AI_MODEL,
			EMBEDDING_API_KEY: process.env.EMBEDDING_API_KEY,
		},
	);
}

export async function requireAISetup(userId: string): Promise<void> {
	const status = await getAISetupStatus(userId);
	if (!status.ready) redirect("/settings?setup=1");
}
