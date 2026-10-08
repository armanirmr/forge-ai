import { githubClient } from "@/lib/github/client";

export async function verifyPersonalRepositoryOwner(
	token: string,
	repository: { githubRepoId: number; owner: string; name: string },
	sessionDisplayName?: string | null,
) {
	const octokit = githubClient(token);
	const [{ data: viewer }, { data: githubRepo }] = await Promise.all([
		octokit.rest.users.getAuthenticated(),
		octokit.rest.repos.get({ owner: repository.owner, repo: repository.name }),
	]);
	if (githubRepo.id !== repository.githubRepoId) {
		throw new Error("GitHub reports a different repository ID. Import it as a new workspace.");
	}
	if (
		githubRepo.owner.type !== "User" ||
		githubRepo.owner.id !== viewer.id ||
		githubRepo.owner.login.toLowerCase() !== viewer.login.toLowerCase() ||
		githubRepo.owner.login.toLowerCase() !== repository.owner.toLowerCase()
	) {
		throw new Error("GitHub did not confirm this personal repository as yours.");
	}
	return [...new Set([viewer.login, viewer.name, repository.owner, sessionDisplayName]
		.filter((label): label is string => Boolean(label?.trim()))
		.map((label) => label.trim()))];
}
