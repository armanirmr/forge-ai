import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { codeChunks, repositoryFiles } from "@/lib/db/schema";

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

	if (keywords.length === 0) {
		return { keywords, snippets: [], fileTree, fileTreeTotal: paths.length };
	}

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

	const rows = await db
		.select({
			path: repositoryFiles.path,
			startLine: codeChunks.startLine,
			endLine: codeChunks.endLine,
			content: codeChunks.content,
			score: score.mapWith(Number),
		})
		.from(codeChunks)
		.innerJoin(
			repositoryFiles,
			eq(codeChunks.repositoryFileId, repositoryFiles.id),
		)
		.where(and(eq(repositoryFiles.repositoryId, repositoryId), gt(score, 0)))
		.orderBy(desc(score), asc(repositoryFiles.path), asc(codeChunks.startLine))
		.limit(limit);

	return { keywords, snippets: rows, fileTree, fileTreeTotal: paths.length };
}
