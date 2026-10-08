import type { Octokit } from "@octokit/rest";
import { isSafeRelativePath } from "@/lib/verify/safe-path";

export type PullRequestFile = {
	path: string;
	original: string | null;
	content: string;
};

type RemoteFile = { content: string | null; mode: string; type: string };

export function pullRequestBranchName(workflowId: string, editsHash: string): string {
	return `changeweft/${workflowId.slice(0, 8)}-${editsHash.slice(0, 10)}`;
}

export function assertRemoteFilesMatch(
	files: PullRequestFile[],
	remote: Map<string, RemoteFile>,
): void {
	if (files.length === 0) throw new Error("There are no changed files to publish");
	if (files.length > 50) throw new Error("A pull request cannot contain more than 50 changed files");
	for (const file of files) {
		if (!isSafeRelativePath(file.path)) {
			throw new Error(`Refusing to publish an unsafe path: ${file.path}`);
		}
		const current = remote.get(file.path);
		if (file.original === null) {
			if (current) throw new Error(`Remote file ${file.path} already exists; refusing to overwrite it`);
			continue;
		}
		if (!current) throw new Error(`Remote file ${file.path} is missing; re-import and regenerate changes`);
		if (current.type !== "blob" || current.content === null) {
			throw new Error(`Remote path ${file.path} is not a regular file; refusing to replace it`);
		}
		if (current.mode !== "100644" && current.mode !== "100755") {
			throw new Error(`Remote file ${file.path} has unsupported Git mode ${current.mode}`);
		}
		if (current.content !== file.original) {
			throw new Error(`Remote file ${file.path} changed since it was imported; re-import and regenerate changes`);
		}
	}
}

/** Creates one commit and one PR from an approved snapshot. Never force-updates a branch. */
export async function createGitHubPullRequest(
	client: Octokit,
	{
		owner,
		repo,
		workflowId,
		editsHash,
		title,
		body,
		files,
	}: {
		owner: string;
		repo: string;
		workflowId: string;
		editsHash: string;
		title: string;
		body: string;
		files: PullRequestFile[];
	},
): Promise<{ branchName: string; baseBranch: string; commitSha: string; number: number; url: string }> {
	const { data: repository } = await client.rest.repos.get({ owner, repo });
	if (repository.private) throw new Error("Milestone 6 currently supports public repositories only");
	if (repository.archived) throw new Error("Cannot create a pull request for an archived repository");
	if (repository.permissions?.push !== true) {
		throw new Error("GitHub did not confirm that this account can push to the repository");
	}

	const baseBranch = repository.default_branch;
	const { data: base } = await client.rest.repos.getBranch({ owner, repo, branch: baseBranch });
	const baseSha = base.commit.sha;
	const { data: baseCommit } = await client.rest.git.getCommit({
		owner,
		repo,
		commit_sha: baseSha,
	});
	const { data: tree } = await client.rest.git.getTree({
		owner,
		repo,
		tree_sha: baseCommit.tree.sha,
		recursive: "true",
	});
	if (tree.truncated) throw new Error("GitHub returned a truncated repository tree; refusing to publish");
	const treeByPath = new Map(
		tree.tree
			.filter((entry): entry is typeof entry & { path: string; sha: string; mode: string } =>
				Boolean(entry.path && entry.sha && entry.mode),
			)
			.map((entry) => [entry.path, entry]),
	);
	const remote = new Map<string, RemoteFile>();
	for (const file of files) {
		const entry = treeByPath.get(file.path);
		if (!entry) continue;
		if (entry.type !== "blob") {
			remote.set(file.path, { content: null, mode: entry.mode, type: entry.type ?? "unknown" });
			continue;
		}
		const { data } = await client.rest.git.getBlob({
			owner,
			repo,
			file_sha: entry.sha,
		});
		remote.set(file.path, {
			content: Buffer.from(data.content, "base64").toString("utf8"),
			mode: entry.mode,
			type: "blob",
		});
	}
	assertRemoteFilesMatch(files, remote);

	const branchName = pullRequestBranchName(workflowId, editsHash);
	let branchExists = false;
	try {
		await client.rest.git.getRef({ owner, repo, ref: `heads/${branchName}` });
		branchExists = true;
	} catch (err) {
		if ((err as { status?: number }).status !== 404) throw err;
	}
	if (branchExists) throw new Error(`Branch ${branchName} already exists; refusing to overwrite it`);

	const blobs = await Promise.all(
		files.map(async (file) => {
			const { data } = await client.rest.git.createBlob({
				owner,
				repo,
				content: file.content,
				encoding: "utf-8",
			});
			return { file, sha: data.sha };
		}),
	);
	const additions = blobs.map(({ file, sha }) => ({
		path: file.path,
		mode: treeByPath.get(file.path)?.mode === "100755" ? ("100755" as const) : ("100644" as const),
		type: "blob" as const,
		sha,
	}));
	const { data: nextTree } = await client.rest.git.createTree({
		owner,
		repo,
		base_tree: baseCommit.tree.sha,
		tree: additions,
	});
	const { data: commit } = await client.rest.git.createCommit({
		owner,
		repo,
		message: `${title}\n\nChangeweft workflow ${workflowId}\nApproved edits ${editsHash}`,
		tree: nextTree.sha,
		parents: [baseSha],
	});
	await client.rest.git.createRef({
		owner,
		repo,
		ref: `refs/heads/${branchName}`,
		sha: commit.sha,
	});
	const { data: pull } = await client.rest.pulls.create({
		owner,
		repo,
		title,
		head: branchName,
		base: baseBranch,
		body,
	});
	return {
		branchName,
		baseBranch,
		commitSha: commit.sha,
		number: pull.number,
		url: pull.html_url,
	};
}
