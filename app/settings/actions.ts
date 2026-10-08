"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { userAISettings } from "@/lib/db/schema";
import { encryptUserCredential } from "@/lib/security/user-credentials";

const Model = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
const ApiKey = z.string().trim().min(8).max(500);

function back(message: string): never {
	redirect(`/settings?${message}`);
}

export async function saveAISettingsAction(formData: FormData) {
	const session = await auth();
	if (!session) redirect("/");
	const userId = session.user.id;
	const provider = z.enum(["gemini", "groq", "openai", "anthropic"]).safeParse(formData.get("provider"));
	const model = Model.safeParse(formData.get("model"));
	const keyInput = z.string().safeParse(formData.get("apiKey"));
	const embeddingInput = z.string().safeParse(formData.get("embeddingApiKey"));
	if (!provider.success || !model.success || !keyInput.success || !embeddingInput.success) {
		back("error=Check+the+provider+and+model+fields");
	}
	const [existing] = await db.select().from(userAISettings).where(eq(userAISettings.userId, userId));
	const apiKey = keyInput.data.trim();
	const sameProvider = existing?.provider === provider.data;
	if (!apiKey && (!existing || !sameProvider)) back("error=Enter+a+chat+API+key+for+this+provider");
	if (apiKey && !ApiKey.safeParse(apiKey).success) back("error=The+chat+API+key+looks+too+short+or+long");
	const embeddingKey = embeddingInput.data.trim();
	if (embeddingKey && !ApiKey.safeParse(embeddingKey).success) back("error=The+embedding+API+key+looks+too+short+or+long");

	const clearEmbedding = formData.get("clearEmbeddingApiKey") === "on";
	const encryptedApiKey = apiKey ? encryptUserCredential(userId, apiKey) : existing!.encryptedApiKey;
	const encryptedEmbeddingApiKey = clearEmbedding
		? null
		: embeddingKey
			? encryptUserCredential(userId, embeddingKey)
			: existing?.encryptedEmbeddingApiKey ?? null;
	await db.insert(userAISettings).values({
		userId,
		provider: provider.data,
		model: model.data,
		encryptedApiKey,
		encryptedEmbeddingApiKey,
		updatedAt: new Date(),
	}).onConflictDoUpdate({
		target: userAISettings.userId,
		set: {
			provider: provider.data,
			model: model.data,
			encryptedApiKey,
			encryptedEmbeddingApiKey,
			updatedAt: new Date(),
		},
	});
	back("saved=1");
}

export async function clearAISettingsAction() {
	const session = await auth();
	if (!session) redirect("/");
	await db.delete(userAISettings).where(eq(userAISettings.userId, session.user.id));
	back("cleared=1");
}
