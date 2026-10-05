import { Octokit } from "@octokit/rest";

export function githubClient(token: string) {
	return new Octokit({ auth: token });
}

export type RepoSummary = {
	githubRepoId: number;
	owner: string;
	name: string;
	description: string | null;
	language: string | null;
	isPrivate: boolean;
	updatedAt: string | null;
};

export async function listOwnedRepos(token: string): Promise<RepoSummary[]> {
	const { data } = await githubClient(
		token,
	).rest.repos.listForAuthenticatedUser({
		affiliation: "owner",
		sort: "updated",
		per_page: 50,
	});
	return data.map((r) => ({
		githubRepoId: r.id,
		owner: r.owner.login,
		name: r.name,
		description: r.description,
		language: r.language,
		isPrivate: r.private,
		updatedAt: r.updated_at,
	}));
}
