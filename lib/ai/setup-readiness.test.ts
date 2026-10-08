import { describe, expect, it } from "vitest";
import { evaluateAISetupStatus, shouldShowAISetupGuide } from "./setup-readiness";

describe("evaluateAISetupStatus", () => {
	const emptyEnvironment = {};

	it("requires chat and embedding credentials on a new account", () => {
		expect(evaluateAISetupStatus(null, emptyEnvironment)).toEqual({
			chatReady: false,
			embeddingReady: false,
			ready: false,
		});
	});

	it("reuses a saved Gemini chat key for embeddings", () => {
		expect(evaluateAISetupStatus(
			{ provider: "gemini", hasChatKey: true, hasEmbeddingKey: false },
			emptyEnvironment,
		)).toEqual({ chatReady: true, embeddingReady: true, ready: true });
	});

	it("requires a separate embedding key for non-Gemini chat", () => {
		expect(evaluateAISetupStatus(
			{ provider: "openai", hasChatKey: true, hasEmbeddingKey: false },
			emptyEnvironment,
		)).toEqual({ chatReady: true, embeddingReady: false, ready: false });
	});

	it("accepts an account embedding key with server chat defaults", () => {
		expect(evaluateAISetupStatus(
			{ provider: "groq", hasChatKey: false, hasEmbeddingKey: true },
			{ AI_PROVIDER: "groq", AI_API_KEY: "server-key", AI_MODEL: "model" },
		)).toEqual({ chatReady: true, embeddingReady: true, ready: true });
	});

	it("accepts Gemini server defaults as chat and embedding credentials", () => {
		expect(evaluateAISetupStatus(
			null,
			{ AI_PROVIDER: "gemini", AI_API_KEY: "server-key", AI_MODEL: "model" },
		)).toEqual({ chatReady: true, embeddingReady: true, ready: true });
	});
});

describe("shouldShowAISetupGuide", () => {
	it("shows the guide for new accounts even when server defaults work", () => {
		expect(shouldShowAISetupGuide(false, false, true, true)).toBe(true);
	});

	it("shows the guide when either service is not ready", () => {
		expect(shouldShowAISetupGuide(false, true, true, false)).toBe(true);
	});

	it("can hide the guide for a configured account unless explicitly requested", () => {
		expect(shouldShowAISetupGuide(false, true, true, true)).toBe(false);
		expect(shouldShowAISetupGuide(true, true, true, true)).toBe(true);
	});
});
