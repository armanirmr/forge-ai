export type SetupConfiguration = {
	provider: string | null;
	hasChatKey: boolean;
	hasEmbeddingKey: boolean;
} | null;

export type SetupEnvironment = {
	AI_PROVIDER?: string;
	AI_API_KEY?: string;
	AI_MODEL?: string;
	EMBEDDING_API_KEY?: string;
};

export function evaluateAISetupStatus(
	saved: SetupConfiguration,
	environment: SetupEnvironment,
) {
	const serverChatReady = Boolean(
		environment.AI_PROVIDER && environment.AI_API_KEY && environment.AI_MODEL,
	);
	const serverEmbeddingReady = Boolean(
		environment.EMBEDDING_API_KEY ||
		(environment.AI_PROVIDER === "gemini" && environment.AI_API_KEY),
	);
	const chatReady = Boolean(saved?.hasChatKey || serverChatReady);
	const embeddingReady = Boolean(
		saved?.hasEmbeddingKey ||
		(saved?.provider === "gemini" && saved.hasChatKey) ||
		serverEmbeddingReady,
	);
	return { chatReady, embeddingReady, ready: chatReady && embeddingReady };
}

export function shouldShowAISetupGuide(
	setupRequested: boolean,
	hasPersonalProvider: boolean,
	chatReady: boolean,
	embeddingReady: boolean,
) {
	return setupRequested || !hasPersonalProvider || !chatReady || !embeddingReady;
}
