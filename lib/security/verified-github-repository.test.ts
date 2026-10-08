import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	githubClient: vi.fn(),
	getAuthenticated: vi.fn(),
	getRepository: vi.fn(),
}));

vi.mock("@/lib/github/client", () => ({ githubClient: mocks.githubClient }));

import { verifyPersonalRepositoryOwner } from "./verified-github-repository";

const repository = { githubRepoId: 42, owner: "armanirmr", name: "forge-test" };

describe("verified personal repository ownership", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getAuthenticated.mockResolvedValue({
			data: { id: 7, login: "armanirmr", name: "Armani Romero" },
		});
		mocks.getRepository.mockResolvedValue({
			data: {
				id: 42,
				owner: { id: 7, login: "armanirmr", type: "User" },
			},
		});
		mocks.githubClient.mockReturnValue({
			rest: {
				users: { getAuthenticated: mocks.getAuthenticated },
				repos: { get: mocks.getRepository },
			},
		});
	});

	it("returns only labels from the verified profile and repository", async () => {
		await expect(verifyPersonalRepositoryOwner("token", repository, " Armani Romero "))
			.resolves.toEqual(["armanirmr", "Armani Romero"]);
		expect(mocks.githubClient).toHaveBeenCalledWith("token");
		expect(mocks.getRepository).toHaveBeenCalledWith({ owner: "armanirmr", repo: "forge-test" });
	});

	it("rejects a repository whose current GitHub ID differs from the stored ID", async () => {
		mocks.getRepository.mockResolvedValueOnce({
			data: { id: 99, owner: { id: 7, login: "armanirmr", type: "User" } },
		});
		await expect(verifyPersonalRepositoryOwner("token", repository))
			.rejects.toThrow("different repository ID");
	});

	it("rejects organization repositories", async () => {
		mocks.getRepository.mockResolvedValueOnce({
			data: { id: 42, owner: { id: 7, login: "armanirmr", type: "Organization" } },
		});
		await expect(verifyPersonalRepositoryOwner("token", repository))
			.rejects.toThrow("personal repository");
	});

	it("rejects a personal repository owned by a different GitHub account", async () => {
		mocks.getRepository.mockResolvedValueOnce({
			data: { id: 42, owner: { id: 8, login: "other-user", type: "User" } },
		});
		await expect(verifyPersonalRepositoryOwner("token", repository))
			.rejects.toThrow("personal repository");
	});
});
