import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	auth: vi.fn(),
	redirect: vi.fn(),
	getGitHubAccessToken: vi.fn(),
	getOwnedRepository: vi.fn(),
	verifyPersonalRepositoryOwner: vi.fn(),
	recoverLegacyWorkflowCreators: vi.fn(),
}));

vi.mock("next/navigation", () => ({
	redirect: (path: string) => {
		mocks.redirect(path);
		throw new Error(`REDIRECT:${path}`);
	},
}));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/github/access-token", () => ({ getGitHubAccessToken: mocks.getGitHubAccessToken }));
vi.mock("@/lib/security/tenant-access", () => ({ getOwnedRepository: mocks.getOwnedRepository }));
vi.mock("@/lib/security/verified-github-repository", () => ({
	verifyPersonalRepositoryOwner: mocks.verifyPersonalRepositoryOwner,
}));
vi.mock("@/lib/security/legacy-workflow-recovery", () => ({
	recoverLegacyWorkflowCreators: mocks.recoverLegacyWorkflowCreators,
}));
vi.mock("@/lib/repository/ingest", () => ({ importRepository: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/ai/setup-status", () => ({ requireAISetup: vi.fn() }));

import { recoverLegacyWorkflowsAction } from "./actions";

const repositoryId = "10000000-0000-4000-8000-000000000001";
const repository = {
	id: repositoryId,
	githubRepoId: 42,
	owner: "armanirmr",
	name: "forge-test",
};

function formForRepository(id = repositoryId) {
	const form = new FormData();
	form.set("repositoryId", id);
	return form;
}

describe("recoverLegacyWorkflowsAction account boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.auth.mockResolvedValue({ user: { id: "user-1", name: "Armani Romero" } });
		mocks.getGitHubAccessToken.mockResolvedValue("github-token");
		mocks.getOwnedRepository.mockResolvedValue(repository);
		mocks.verifyPersonalRepositoryOwner.mockResolvedValue(["armanirmr", "Armani Romero"]);
		mocks.recoverLegacyWorkflowCreators.mockResolvedValue(13);
	});

	it("does not contact GitHub or change creators for another account's repository", async () => {
		mocks.getOwnedRepository.mockResolvedValueOnce(null);

		await expect(recoverLegacyWorkflowsAction(formForRepository()))
			.rejects.toThrow("REDIRECT:/repositories");

		expect(mocks.getOwnedRepository).toHaveBeenCalledWith(repositoryId, "user-1");
		expect(mocks.verifyPersonalRepositoryOwner).not.toHaveBeenCalled();
		expect(mocks.recoverLegacyWorkflowCreators).not.toHaveBeenCalled();
	});

	it("recovers only after the owned repository is verified with the current GitHub identity", async () => {
		await expect(recoverLegacyWorkflowsAction(formForRepository()))
			.rejects.toThrow(`REDIRECT:/repositories/${repositoryId}?recovered=13`);

		expect(mocks.getOwnedRepository).toHaveBeenCalledWith(repositoryId, "user-1");
		expect(mocks.verifyPersonalRepositoryOwner).toHaveBeenCalledWith(
			"github-token",
			repository,
			"Armani Romero",
		);
		expect(mocks.recoverLegacyWorkflowCreators).toHaveBeenCalledWith(
			repositoryId,
			"user-1",
			["armanirmr", "Armani Romero"],
		);
	});
});
