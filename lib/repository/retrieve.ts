import { and, asc, cosineDistance, desc, eq, gt, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { codeChunks, repositoryFiles } from "@/lib/db/schema";
import { embedCodeQuery, EMBEDDING_MODEL } from "./embeddings";

const STOPWORDS = new Set([
	"the",
	"and",
	"for",
	"with",
	"from",
	"that",
	"this",
	"are",
	"was",
	"will",
	"can",
	"should",
	"when",
	"all",
	"any",
	"new",
	"able",
	"need",
	"want",
	"please",
	"add",
	"create",
	"make",
	"implement",
	"support",
	"allow",
	"into",
	"have",
	"has",
	"its",
]);

/** Crude English keyword extraction. Embeddings replace this in Phase 3. */
export function extractKeywords(text: string, max = 12): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const raw of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
		if (raw.length < 3 || STOPWORDS.has(raw)) continue;
		const word =
			raw.length > 3 && raw.endsWith("s") && !raw.endsWith("ss")
				? raw.slice(0, -1)
				: raw;
		if (seen.has(word)) continue;
		seen.add(word);
		out.push(word);
		if (out.length >= max) break;
	}
	return out;
}

export type RetrievedSnippet = {
	path: string;
	startLine: number;
	endLine: number;
	content: string;
	score: number;
};

export type RetrievedContext = {
	keywords: string[];
	snippets: RetrievedSnippet[];
	fileTree: string[];
	fileTreeTotal: number;
};

export async function retrieveContext(
	repositoryId: string,
	requirement: string,
	{ limit = 8, maxTreeEntries = 300 } = {},
): Promise<RetrievedContext> {
	const keywords = extractKeywords(requirement);

	const paths = await db
		.select({ path: repositoryFiles.path })
		.from(repositoryFiles)
		.where(eq(repositoryFiles.repositoryId, repositoryId))
		.orderBy(asc(repositoryFiles.path));
	const fileTree = paths.slice(0, maxTreeEntries).map((p) => p.path);

	const queryVector = await embedCodeQuery(requirement);
	const distance = cosineDistance(codeChunks.embedding, queryVector);
	const semanticRows = await db
		.select({
			path: repositoryFiles.path,
			startLine: codeChunks.startLine,
			endLine: codeChunks.endLine,
			content: codeChunks.content,
		})
		.from(codeChunks)
		.innerJoin(repositoryFiles, eq(codeChunks.repositoryFileId, repositoryFiles.id))
		.where(
			and(
				eq(repositoryFiles.repositoryId, repositoryId),
				eq(codeChunks.embeddingModel, EMBEDDING_MODEL),
				isNotNull(codeChunks.embedding),
			),
		)
		.orderBy(distance, asc(repositoryFiles.path), asc(codeChunks.startLine))
		.limit(limit * 4);

	let keywordRows: RetrievedSnippet[] = [];
	if (keywords.length > 0) {
		const contentScore = sql.join(
			keywords.map(
				(k) =>
					sql`(case when strpos(lower(${codeChunks.content}), ${k}) > 0 then 1 else 0 end)`,
			),
			sql` + `,
		);
		const pathScore = sql.join(
			keywords.map(
				(k) =>
					sql`(case when strpos(lower(${repositoryFiles.path}), ${k}) > 0 then 2 else 0 end)`,
			),
			sql` + `,
		);
		const score = sql<number>`(${contentScore}) + (${pathScore})`;
		keywordRows = await db
			.select({
				path: repositoryFiles.path,
				startLine: codeChunks.startLine,
				endLine: codeChunks.endLine,
				content: codeChunks.content,
				score: score.mapWith(Number),
			})
			.from(codeChunks)
			.innerJoin(repositoryFiles, eq(codeChunks.repositoryFileId, repositoryFiles.id))
			.where(and(eq(repositoryFiles.repositoryId, repositoryId), gt(score, 0)))
			.orderBy(desc(score), asc(repositoryFiles.path), asc(codeChunks.startLine))
			.limit(limit * 4);
	}

	// Reciprocal rank fusion combines semantic similarity with exact keyword/path hits.
	const fused = new Map<string, RetrievedSnippet>();
	const addRanked = (rows: Omit<RetrievedSnippet, "score">[], weight: number) => {
		rows.forEach((row, index) => {
			const key = `${row.path}\0${row.startLine}\0${row.endLine}`;
			const prior = fused.get(key);
			fused.set(key, {
				...row,
				score: (prior?.score ?? 0) + weight / (60 + index + 1),
			});
		});
	};
	addRanked(semanticRows, 1);
	addRanked(keywordRows, 0.7);
	const snippets = [...fused.values()]
		.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path) || a.startLine - b.startLine)
		.slice(0, limit);

	return { keywords, snippets, fileTree, fileTreeTotal: paths.length };
}
