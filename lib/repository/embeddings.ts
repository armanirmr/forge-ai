import { GoogleGenAI } from "@google/genai";
import { redactSecrets } from "@/lib/security/redact";
import { getEmbeddingApiKey } from "@/lib/ai/user-settings";

export const EMBEDDING_MODEL = "gemini-embedding-2";
export const EMBEDDING_DIMENSIONS = 768;
const EMBEDDING_BATCH_SIZE = 16;

export type CodeDocument = {
	path: string;
	startLine: number;
	endLine: number;
	content: string;
};

async function createEmbeddingClient(userId?: string): Promise<GoogleGenAI> {
	return new GoogleGenAI({ apiKey: await getEmbeddingApiKey(userId) });
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
export async function embedCodeDocuments(documents: CodeDocument[], userId?: string): Promise<number[][]> {
	if (documents.length === 0) return [];
	const client = await createEmbeddingClient(userId);
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
export async function embedCodeQuery(query: string, userId?: string): Promise<number[]> {
	const client = await createEmbeddingClient(userId);
	const clean = redactSecrets(query).text;
	const result = await client.models.embedContent({
		model: EMBEDDING_MODEL,
		contents: { parts: [{ text: `task: code retrieval | query: ${clean}` }] },
		config: { outputDimensionality: EMBEDDING_DIMENSIONS },
	});
	return validateVectors(result.embeddings?.map((embedding) => embedding.values) ?? [], 1)[0];
}
