import { GoogleGenAI } from "@google/genai";
import { redactSecrets } from "@/lib/security/redact";

export const EMBEDDING_MODEL = "gemini-embedding-2";
export const EMBEDDING_DIMENSIONS = 768;
const EMBEDDING_BATCH_SIZE = 16;

export type CodeDocument = {
	path: string;
	startLine: number;
	endLine: number;
	content: string;
};

function createEmbeddingClient(): GoogleGenAI {
	const apiKey =
		process.env.EMBEDDING_API_KEY ??
		(process.env.AI_PROVIDER === "gemini" ? process.env.AI_API_KEY : undefined);
	if (!apiKey) {
		throw new Error(
			"Set EMBEDDING_API_KEY to a Google AI Studio key (or use AI_PROVIDER=gemini with AI_API_KEY) to index and search code",
		);
	}
	return new GoogleGenAI({ apiKey });
}

function documentText(document: CodeDocument): string {
	const clean = redactSecrets(document.content).text;
	return `title: ${document.path} lines ${document.startLine}-${document.endLine} | text: ${clean}`;
}

function validateVectors(vectors: (number[] | undefined)[], expected: number): number[][] {
	if (vectors.length !== expected) {
		throw new Error(`Embedding provider returned ${vectors.length} vectors for ${expected} code chunks`);
	}
	return vectors.map((vector, index) => {
		if (
			!vector ||
			vector.length !== EMBEDDING_DIMENSIONS ||
			vector.some((value) => !Number.isFinite(value))
		) {
			throw new Error(`Embedding provider returned an invalid ${EMBEDDING_DIMENSIONS}-dimension vector at item ${index + 1}`);
		}
		return vector;
	});
}

/** Embeds code chunks in small provider batches; vectors stay aligned with input order. */
export async function embedCodeDocuments(documents: CodeDocument[]): Promise<number[][]> {
	if (documents.length === 0) return [];
	const client = createEmbeddingClient();
	const vectors: number[][] = [];
	for (let offset = 0; offset < documents.length; offset += EMBEDDING_BATCH_SIZE) {
		const batch = documents.slice(offset, offset + EMBEDDING_BATCH_SIZE);
		const result = await client.models.embedContent({
			model: EMBEDDING_MODEL,
			contents: batch.map((document) => ({ parts: [{ text: documentText(document) }] })),
			config: { outputDimensionality: EMBEDDING_DIMENSIONS },
		});
		vectors.push(...validateVectors(result.embeddings?.map((embedding) => embedding.values) ?? [], batch.length));
	}
	return vectors;
}

/** Embeds a natural-language query in the same code-retrieval space as indexed chunks. */
export async function embedCodeQuery(query: string): Promise<number[]> {
	const client = createEmbeddingClient();
	const clean = redactSecrets(query).text;
	const result = await client.models.embedContent({
		model: EMBEDDING_MODEL,
		contents: { parts: [{ text: `task: code retrieval | query: ${clean}` }] },
		config: { outputDimensionality: EMBEDDING_DIMENSIONS },
	});
	return validateVectors(result.embeddings?.map((embedding) => embedding.values) ?? [], 1)[0];
}
