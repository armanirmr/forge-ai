import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { repositories, repositoryFiles, codeChunks } from "@/lib/db/schema";
import { githubClient } from "@/lib/github/client";
import { shouldIndexFile } from "./ignore";
import { chunkLines } from "./chunk";
import { detectLanguage } from "./language";
import { eq } from "drizzle-orm";

export const MAX_FILES = 500;
const FETCH_CONCURRENCY = 10;
const INSERT_BATCH = 200;

export type ImportResult = {
	repositoryId: string;
	filesIndexed: number;
	filesSkippedBinaryContent: number;
	chunks: number;
	/** True if GitHub truncated the tree or we hit MAX_FILES. The index is then partial. */
	partial: boolean;
};

export async function importRepository(
	token: string,
	owner: string,
	name: string,
): Promise<ImportResult> {
	const octokit = githubClient(token);

	const { data: repo } = await octokit.rest.repos.get({ owner, repo: name });
	const { data: tree } = await octokit.rest.git.getTree({
		owner,
		repo: name,
		tree_sha: repo.default_branch,
		recursive: "true",
	});

	const candidates = tree.tree.filter(
		(e): e is typeof e & { path: string; sha: string } =>
			e.type === "blob" &&
			!!e.path &&
			!!e.sha &&
			shouldIndexFile(e.path, e.size ?? 0).index,
	);
	const selected = candidates.slice(0, MAX_FILES);
	const partial = Boolean(tree.truncated) || candidates.length > MAX_FILES;

	type Fetched = { path: string; content: string; size: number };
	const fetched: Fetched[] = [];
	let skippedBinary = 0;

	for (let i = 0; i < selected.length; i += FETCH_CONCURRENCY) {
		const batch = selected.slice(i, i + FETCH_CONCURRENCY);
		const results = await Promise.all(
			batch.map(async (entry) => {
				const { data } = await octokit.rest.git.getBlob({
					owner,
					repo: name,
					file_sha: entry.sha,
				});
				const buf = Buffer.from(data.content, "base64");
				if (buf.includes(0)) return null; // binary content, despite the extension
				return {
					path: entry.path,
					content: buf.toString("utf8"),
					size: buf.length,
				};
			}),
		);
		for (const r of results) {
			if (r) fetched.push(r);
			else skippedBinary += 1;
		}
	}

	return db.transaction(async (tx) => {
		const [row] = await tx
			.insert(repositories)
			.values({
				githubRepoId: repo.id,
				name: repo.name,
				owner: repo.owner.login,
				defaultBranch: repo.default_branch,
				language: repo.language,
			})
			.onConflictDoUpdate({
				target: repositories.githubRepoId,
				set: {
					name: repo.name,
					owner: repo.owner.login,
					defaultBranch: repo.default_branch,
					language: repo.language,
					updatedAt: new Date(),
				},
			})
			.returning({ id: repositories.id });

		// Re-import replaces the previous index (chunks cascade-delete).
		await tx
			.delete(repositoryFiles)
			.where(eq(repositoryFiles.repositoryId, row.id));

		const pathToId = new Map<string, string>();
		for (let i = 0; i < fetched.length; i += INSERT_BATCH) {
			const batch = fetched.slice(i, i + INSERT_BATCH);
			const inserted = await tx
				.insert(repositoryFiles)
				.values(
					batch.map((f) => ({
						repositoryId: row.id,
						path: f.path,
						language: detectLanguage(f.path),
						size: f.size,
						hash: createHash("sha256").update(f.content).digest("hex"),
						content: f.content,
					})),
				)
				.returning({ id: repositoryFiles.id, path: repositoryFiles.path });
			for (const r of inserted) pathToId.set(r.path, r.id);
		}

		const chunkRows = fetched.flatMap((f) =>
			chunkLines(f.content).map((c) => ({
				repositoryFileId: pathToId.get(f.path)!,
				content: c.content,
				startLine: c.startLine,
				endLine: c.endLine,
			})),
		);
		for (let i = 0; i < chunkRows.length; i += INSERT_BATCH) {
			await tx.insert(codeChunks).values(chunkRows.slice(i, i + INSERT_BATCH));
		}

		return {
			repositoryId: row.id,
			filesIndexed: fetched.length,
			filesSkippedBinaryContent: skippedBinary,
			chunks: chunkRows.length,
			partial,
		};
	});
}
