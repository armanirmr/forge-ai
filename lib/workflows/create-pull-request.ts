import { and, desc, eq } from "drizzle-orm";
import { Octokit } from "@octokit/rest";
import { db } from "@/lib/db";
import {
	changeApprovals,
	changeReviews,
	pullRequests,
	repositories,
	verificationRuns,
	workflowEvents,
	workflows,
} from "@/lib/db/schema";
import { redactSecrets } from "@/lib/security/redact";
import { VerificationResultSchema } from "@/lib/verify/types";
import { createGitHubPullRequest, pullRequestBranchName } from "@/lib/github/pull-request";
import { loadReview } from "./review-changes";
import { loadWorkspaceState } from "./workspace";

export async function createApprovedPullRequest(
	workflowId: string,
	userId: string,
	accessToken: string | undefined,
): Promise<string | null> {
	if (!accessToken) return "A GitHub access token is required; sign in again";
	const [wf] = await db
		.select({ repositoryId: workflows.repositoryId, status: workflows.status, requirement: workflows.requirement })
		.from(workflows)
		.where(eq(workflows.id, workflowId));
	if (!wf) return "Workflow not found";
	if (wf.status !== "changes_approved") return "Changes must be approved before creating a pull request";

	const [approval] = await db.select().from(changeApprovals).where(eq(changeApprovals.workflowId, workflowId));
	if (!approval || approval.decision !== "approved") return "No approved change record was found";
	if (approval.decidedBy !== `user:${userId}`) return "Only the user who approved these changes can create the pull request";

	let review;
	try {
		review = await loadReview(workflowId, wf.repositoryId, wf.status);
	} catch (err) {
		return err instanceof Error ? err.message : String(err);
	}
	if (review.editsHash !== approval.editsHash) return "The current edits differ from the approved edits";
	if (review.latestRun?.status !== "passed" || !review.verificationCurrent) {
		return "The latest verification must have passed for the current edits";
	}

	const [repo] = await db.select().from(repositories).where(eq(repositories.id, wf.repositoryId));
	if (!repo) return "Repository not found";
	const [existing] = await db.select().from(pullRequests).where(eq(pullRequests.workflowId, workflowId));
	if (existing?.status === "created") return existing.pullUrl ?? "A pull request was already created";
	if (existing?.status === "creating") return "Pull request creation is already in progress";

	const branchName = pullRequestBranchName(workflowId, review.editsHash);
	const now = new Date();
	try {
		if (existing) {
			const [claimed] = await db.update(pullRequests).set({ status: "creating", error: null, updatedAt: now })
				.where(and(eq(pullRequests.id, existing.id), eq(pullRequests.status, "failed")))
				.returning({ id: pullRequests.id });
			if (!claimed) return "Pull request creation was claimed by another request; refresh and try again";
		} else {
			await db.insert(pullRequests).values({
				workflowId,
				approvalId: approval.id,
				editsHash: review.editsHash,
				branchName,
				baseBranch: repo.defaultBranch,
				status: "creating",
			});
		}
	} catch {
		return "Pull request creation was claimed by another request; refresh and try again";
	}

	await db.insert(workflowEvents).values({
		workflowId,
		type: "PULL_REQUEST_REQUESTED",
		actor: `user:${userId}`,
		metadata: { editsHash: review.editsHash, branchName },
	});

	try {
		const state = await loadWorkspaceState(workflowId, wf.repositoryId);
		const files = [...new Set(state.touched)].sort().map((path) => ({
			path,
			original: Object.prototype.hasOwnProperty.call(state.original, path) ? state.original[path] : null,
			content: state.current.get(path) ?? "",
		}));
		for (const file of files) {
			if (redactSecrets(file.content).redactions > 0) {
				throw new Error(`Refusing to publish ${file.path}: it contains text that looks like a secret`);
			}
		}
		const [latestRun] = await db.select({ result: verificationRuns.result })
			.from(verificationRuns).where(eq(verificationRuns.workflowId, workflowId))
			.orderBy(desc(verificationRuns.createdAt)).limit(1);
		const parsedVerification = latestRun ? VerificationResultSchema.safeParse(latestRun.result) : null;
		if (!parsedVerification?.success) throw new Error("The latest verification result is invalid");
		const [aiReview] = await db.select({ status: changeReviews.status, editsHash: changeReviews.editsHash })
			.from(changeReviews).where(eq(changeReviews.workflowId, workflowId))
			.orderBy(desc(changeReviews.createdAt)).limit(1);
		const cleanRequirement = redactSecrets(wf.requirement).text;
		const body = redactSecrets([
			"## ForgeAI change summary",
			"",
			cleanRequirement,
			"",
			"## Changed files",
			...files.map((file) => `- \`${file.path}\``),
			"",
			"## Verification",
			`- Result: **${parsedVerification.data.status}** (current at approval time)`,
			...parsedVerification.data.steps.map((step) => `- ${step.name}: ${step.exitCode === 0 ? "passed" : `exit ${step.exitCode}`}${step.timedOut ? " (timed out)" : ""}`),
			...parsedVerification.data.skipped.map((step) => `- ${step.name}: skipped (${step.reason})`),
			`- AI review: ${aiReview?.editsHash === review.editsHash ? aiReview.status : "not available for this exact edit set"} (opinion only)`,
			"",
			`Approved by ${approval.decidedBy} on ${approval.createdAt.toISOString()} for edits hash \`${review.editsHash}\`.`,
			"",
			"ForgeAI does not merge pull requests.",
		].join("\n")).text;
		const result = await createGitHubPullRequest(new Octokit({ auth: accessToken }), {
			owner: repo.owner,
			repo: repo.name,
			workflowId,
			editsHash: review.editsHash,
			title: `ForgeAI: ${cleanRequirement.split(/\r?\n/)[0].slice(0, 100) || "implement approved changes"}`,
			body,
			files,
		});
		await db.update(pullRequests).set({
			status: "created", branchName: result.branchName, baseBranch: result.baseBranch,
			commitSha: result.commitSha, pullNumber: result.number, pullUrl: result.url,
			error: null, updatedAt: new Date(),
		}).where(eq(pullRequests.workflowId, workflowId));
		await db.insert(workflowEvents).values({
			workflowId, type: "PULL_REQUEST_CREATED", actor: `user:${userId}`,
			metadata: { editsHash: review.editsHash, ...result },
		});
		return null;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		await db.update(pullRequests).set({ status: "failed", error: message, updatedAt: new Date() })
			.where(eq(pullRequests.workflowId, workflowId));
		await db.insert(workflowEvents).values({
			workflowId, type: "PULL_REQUEST_FAILED", actor: "system",
			metadata: { editsHash: review.editsHash, branchName, error: message },
		});
		return message;
	}
}
