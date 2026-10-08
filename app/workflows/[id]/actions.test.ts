import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	auth: vi.fn(),
	redirect: vi.fn(),
	getOwnedWorkflow: vi.fn(),
	requireAISetup: vi.fn(),
	startPlanning: vi.fn(),
	retryRequirementAnalysis: vi.fn(),
	cancelWorkflow: vi.fn(),
}));

vi.mock("next/navigation", () => ({
	redirect: (path: string) => {
		mocks.redirect(path);
		throw new Error(`REDIRECT:${path}`);
	},
}));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/security/tenant-access", () => ({ getOwnedWorkflow: mocks.getOwnedWorkflow }));
vi.mock("@/lib/ai/setup-status", () => ({ requireAISetup: mocks.requireAISetup }));
vi.mock("@/lib/workflows/generate-plan", () => ({
	requestPlanChanges: vi.fn(),
	startPlanning: mocks.startPlanning,
}));
vi.mock("@/lib/workflows/analyze-requirement", () => ({ retryRequirementAnalysis: mocks.retryRequirementAnalysis }));
vi.mock("@/lib/workflows/cancel", () => ({ cancelWorkflow: mocks.cancelWorkflow }));
vi.mock("@/lib/workflows/generate-code", () => ({ approvePlan: vi.fn(), startCodeGeneration: vi.fn() }));
vi.mock("@/lib/workflows/verify-changes", () => ({ startVerification: vi.fn() }));
vi.mock("@/lib/workflows/repair-changes", () => ({ startRepair: vi.fn() }));
vi.mock("@/lib/workflows/review-changes", () => ({ approveChanges: vi.fn(), rejectChanges: vi.fn() }));
vi.mock("@/lib/workflows/ai-review", () => ({ startAiReview: vi.fn() }));
vi.mock("@/lib/workflows/create-pull-request", () => ({ createApprovedPullRequest: vi.fn() }));
vi.mock("@/lib/github/access-token", () => ({ getGitHubAccessToken: vi.fn() }));

import { cancelWorkflowAction, generatePlanAction, retryAnalysisAction } from "./actions";

const workflowId = "10000000-0000-4000-8000-000000000002";

describe("workflow actions account boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
		mocks.getOwnedWorkflow.mockResolvedValue(null);
	});

	it("blocks workflow actions when the signed-in account does not own the workflow", async () => {
		const form = new FormData();
		form.set("workflowId", workflowId);

		await expect(generatePlanAction(form)).rejects.toThrow("REDIRECT:/repositories");

		expect(mocks.getOwnedWorkflow).toHaveBeenCalledWith(workflowId, "user-1");
		expect(mocks.requireAISetup).not.toHaveBeenCalled();
		expect(mocks.startPlanning).not.toHaveBeenCalled();
	});

	it("retries analysis only after checking workflow ownership and AI setup", async () => {
		mocks.getOwnedWorkflow.mockResolvedValue({ workflow: { id: workflowId }, repository: { id: "repo-1" } });
		mocks.retryRequirementAnalysis.mockResolvedValue(true);
		const form = new FormData();
		form.set("workflowId", workflowId);

		await expect(retryAnalysisAction(form)).rejects.toThrow(`REDIRECT:/workflows/${workflowId}`);

		expect(mocks.getOwnedWorkflow).toHaveBeenCalledWith(workflowId, "user-1");
		expect(mocks.requireAISetup).toHaveBeenCalledWith("user-1");
		expect(mocks.retryRequirementAnalysis).toHaveBeenCalledWith(workflowId, "user-1");
	});

	it("cancels an owned workflow and returns to its page", async () => {
		mocks.getOwnedWorkflow.mockResolvedValue({ workflow: { id: workflowId }, repository: { id: "repo-1" } });
		const form = new FormData();
		form.set("workflowId", workflowId);

		await expect(cancelWorkflowAction(form)).rejects.toThrow(`REDIRECT:/workflows/${workflowId}`);

		expect(mocks.cancelWorkflow).toHaveBeenCalledWith(workflowId, "user-1");
	});
});
