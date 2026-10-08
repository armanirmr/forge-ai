import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	auth: vi.fn(),
	redirect: vi.fn(),
	getOwnedWorkflow: vi.fn(),
	transaction: vi.fn(),
	tx: {
		update: vi.fn(),
		insert: vi.fn(),
	},
}));

vi.mock("next/navigation", () => ({
	redirect: (path: string) => {
		mocks.redirect(path);
		throw new Error(`REDIRECT:${path}`);
	},
}));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/security/tenant-access", () => ({
	getOwnedRepository: vi.fn(),
	getOwnedWorkflow: mocks.getOwnedWorkflow,
}));
vi.mock("@/lib/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/lib/ai/setup-status", () => ({ requireAISetup: vi.fn() }));
vi.mock("@/lib/workflows/analyze-requirement", () => ({ startRequirementAnalysis: vi.fn() }));

import { archiveWorkflowAction, restoreWorkflowAction } from "./actions";

const repositoryId = "10000000-0000-4000-8000-000000000001";
const workflowId = "10000000-0000-4000-8000-000000000002";
const repository = { id: repositoryId };

function archiveForm(repository = repositoryId) {
	const form = new FormData();
	form.set("repositoryId", repository);
	form.set("workflowId", workflowId);
	return form;
}

function setupTransaction(updated = true) {
	const updateBuilder = {
		set: vi.fn().mockReturnThis(),
		where: vi.fn().mockReturnThis(),
		returning: vi.fn().mockResolvedValue(updated ? [{ id: workflowId }] : []),
	};
	mocks.tx.update.mockReturnValue(updateBuilder);
	const values = vi.fn().mockResolvedValue(undefined);
	mocks.tx.insert.mockReturnValue({ values });
	mocks.transaction.mockImplementation(async (run) => run(mocks.tx));
	return { updateBuilder, values };
}

describe("workflow archive actions", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
		mocks.getOwnedWorkflow.mockResolvedValue({
			workflow: { id: workflowId, archivedAt: null },
			repository,
		});
		setupTransaction();
	});

	it("does not archive a workflow through a different repository", async () => {
		await expect(archiveWorkflowAction(archiveForm("10000000-0000-4000-8000-000000000003")))
			.rejects.toThrow("REDIRECT:/repositories");

		expect(mocks.transaction).not.toHaveBeenCalled();
	});

	it("archives the owned workflow and records an event", async () => {
		const { values } = setupTransaction();
		await expect(archiveWorkflowAction(archiveForm()))
			.rejects.toThrow(`REDIRECT:/repositories/${repositoryId}?workflowArchive=archived#workflow-history`);

		expect(mocks.getOwnedWorkflow).toHaveBeenCalledWith(workflowId, "user-1");
		expect(values).toHaveBeenCalledWith(expect.objectContaining({
			workflowId,
			type: "WORKFLOW_ARCHIVED",
			actor: "user:user-1",
		}));
	});

	it("restores an archived workflow and records a restore event", async () => {
		mocks.getOwnedWorkflow.mockResolvedValueOnce({
			workflow: { id: workflowId, archivedAt: new Date("2026-10-01T00:00:00.000Z") },
			repository,
		});
		const { values } = setupTransaction();
		await expect(restoreWorkflowAction(archiveForm()))
			.rejects.toThrow(`REDIRECT:/repositories/${repositoryId}?workflowArchive=active#workflow-history`);

		expect(values).toHaveBeenCalledWith(expect.objectContaining({
			workflowId,
			type: "WORKFLOW_RESTORED",
			actor: "user:user-1",
		}));
	});
});
