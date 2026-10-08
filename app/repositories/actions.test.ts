import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	auth: vi.fn(),
	redirect: vi.fn(),
	getGitHubAccessToken: vi.fn(),
	getOwnedRepository: vi.fn(),
	verifyPersonalRepositoryOwner: vi.fn(),
	recoverLegacyWorkflowCreators: vi.fn(),
	dbSelect: vi.fn(),
	dbTransaction: vi.fn(),
	transactionSelect: vi.fn(),
	transactionUpdate: vi.fn(),
	transactionInsert: vi.fn(),
	settingsInsertValues: vi.fn(),
	decryptUserCredential: vi.fn(),
	encryptUserCredential: vi.fn(),
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
vi.mock("@/lib/db", () => ({
	db: {
		select: (...args: unknown[]) => mocks.dbSelect(...args),
		transaction: (...args: unknown[]) => mocks.dbTransaction(...args),
	},
}));
vi.mock("@/lib/ai/setup-status", () => ({ requireAISetup: vi.fn() }));
vi.mock("@/lib/security/user-credentials", () => ({
	decryptUserCredential: mocks.decryptUserCredential,
	encryptUserCredential: mocks.encryptUserCredential,
}));

import { recoverLegacyWorkflowsAction, restoreLegacyRepositoryAction } from "./actions";

const repositoryId = "10000000-0000-4000-8000-000000000001";
const repository = {
	id: repositoryId,
	githubRepoId: 42,
	owner: "armanirmr",
	name: "forge-test",
	ownerUserId: "previous-session-id",
};

function formForRepository(id = repositoryId) {
	const form = new FormData();
	form.set("repositoryId", id);
	return form;
}

function resetMocks() {
		vi.clearAllMocks();
		mocks.auth.mockResolvedValue({ user: { id: "user-1", name: "Armani Romero" } });
		mocks.getGitHubAccessToken.mockResolvedValue("github-token");
		mocks.getOwnedRepository.mockResolvedValue(repository);
		mocks.verifyPersonalRepositoryOwner.mockResolvedValue(["armanirmr", "Armani Romero"]);
		mocks.decryptUserCredential.mockImplementation((userId: string, value: string) => `clear:${userId}:${value}`);
		mocks.encryptUserCredential.mockImplementation((userId: string, value: string) => `sealed:${userId}:${value}`);
		mocks.recoverLegacyWorkflowCreators.mockResolvedValue(13);
		mocks.dbSelect.mockReturnValue({ from: () => ({ where: async () => [repository] }) });
		mocks.transactionSelect.mockReset();
		mocks.transactionUpdate.mockReset();
		mocks.transactionInsert.mockReset();
		mocks.dbTransaction.mockReset();
		mocks.transactionSelect.mockReturnValue({ from: () => ({ where: async () => [] }) });
		mocks.transactionUpdate
			.mockImplementationOnce(() => ({
				set: () => ({ where: () => ({ returning: async () => [{ id: repositoryId }] }) }),
			}))
			.mockImplementationOnce(() => ({
				set: () => ({ where: () => ({ returning: async () => Array.from({ length: 13 }, (_, index) => ({ id: `workflow-${index}` })) }) }),
			}));
		mocks.transactionInsert.mockReturnValue({ values: async () => undefined });
		mocks.dbTransaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
			select: (...args: unknown[]) => mocks.transactionSelect(...args),
			update: (...args: unknown[]) => mocks.transactionUpdate(...args),
			insert: (...args: unknown[]) => mocks.transactionInsert(...args),
		}));
}

describe("recoverLegacyWorkflowsAction account boundary", () => {
	beforeEach(resetMocks);

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

describe("restoreLegacyRepositoryAction", () => {
	beforeEach(resetMocks);

	it("restores an existing workspace after verifying the current GitHub owner", async () => {
		await expect(restoreLegacyRepositoryAction(formForRepository()))
			.rejects.toThrow(`REDIRECT:/repositories/${repositoryId}?restored=1&recovered=13`);

		expect(mocks.verifyPersonalRepositoryOwner).toHaveBeenCalledWith(
			"github-token",
			repository,
			"Armani Romero",
		);
		expect(mocks.dbTransaction).toHaveBeenCalledOnce();
		expect(mocks.transactionUpdate).toHaveBeenCalledTimes(2);
		expect(mocks.transactionInsert).toHaveBeenCalledOnce();
	});

	it("does not reassign a workspace unless GitHub verifies personal ownership", async () => {
		mocks.verifyPersonalRepositoryOwner.mockRejectedValueOnce(new Error("Not your repository"));

		await expect(restoreLegacyRepositoryAction(formForRepository()))
			.rejects.toThrow("REDIRECT:/repositories?error=Not%20your%20repository");

		expect(mocks.dbTransaction).not.toHaveBeenCalled();
	});

	it("re-encrypts saved AI credentials when reconnecting an old account ID", async () => {
		const previousSettings = {
			userId: "previous-session-id",
			provider: "openai",
			model: "gpt-4.1-mini",
			encryptedApiKey: "old-chat-envelope",
			encryptedEmbeddingApiKey: "old-embedding-envelope",
		};
		const emptyQuery = { from: () => ({ where: async () => [] }) };
		mocks.transactionSelect
			.mockReturnValueOnce(emptyQuery)
			.mockReturnValueOnce({ from: () => ({ where: async () => [previousSettings] }) })
			.mockReturnValueOnce(emptyQuery);
		mocks.transactionInsert
			.mockImplementationOnce(() => ({
				values: (values: unknown) => {
					mocks.settingsInsertValues(values);
					return { onConflictDoNothing: async () => undefined };
				},
			}))
			.mockImplementationOnce(() => ({ values: async () => undefined }));

		await expect(restoreLegacyRepositoryAction(formForRepository()))
			.rejects.toThrow(`REDIRECT:/repositories/${repositoryId}?restored=1&recovered=13`);

		expect(mocks.decryptUserCredential).toHaveBeenNthCalledWith(1, "previous-session-id", "old-chat-envelope");
		expect(mocks.encryptUserCredential).toHaveBeenNthCalledWith(1, "user-1", "clear:previous-session-id:old-chat-envelope");
		expect(mocks.settingsInsertValues).toHaveBeenCalledWith(expect.objectContaining({
			userId: "user-1",
			provider: "openai",
			encryptedApiKey: "sealed:user-1:clear:previous-session-id:old-chat-envelope",
			encryptedEmbeddingApiKey: "sealed:user-1:clear:previous-session-id:old-embedding-envelope",
		}));
	});
});
