import { eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { pullRequests } from "@/lib/db/schema";
import { getGitHubAccessToken } from "@/lib/github/access-token";
import { createPullRequestAction } from "./actions";

export async function PullRequestBlock({
	workflowId,
	canCreate,
}: {
	workflowId: string;
	canCreate: boolean;
}) {
	const [pull] = await db.select().from(pullRequests).where(eq(pullRequests.workflowId, workflowId));
	if (pull?.status === "created") {
		return (
			<div className="space-y-2 rounded border p-3">
				<div className="flex items-center gap-2"><Badge variant="secondary">PR created</Badge>
					<span className="font-mono text-xs">{pull.branchName}</span></div>
				<a className="text-sm text-primary underline" href={pull.pullUrl ?? "#"} target="_blank" rel="noreferrer">
					Open pull request #{pull.pullNumber}
				</a>
			</div>
		);
	}
	if (pull?.status === "creating") {
		return <p role="status" className="rounded border p-3 text-sm">Pull request creation is in progress.</p>;
	}
	if (!canCreate) return null;
	const accessToken = await getGitHubAccessToken();
	return (
		<div className="space-y-2 rounded border p-3">
			{pull?.error && <p role="alert" className="text-sm text-red-600">Pull request failed: {pull.error}</p>}
			<form action={createPullRequestAction}>
				<input type="hidden" name="workflowId" value={workflowId} />
				<Button type="submit" disabled={!accessToken}>
					{pull?.status === "failed" ? "Retry pull request creation" : "Create GitHub pull request"}
				</Button>
				<p className="mt-2 text-xs text-muted-foreground">
					Creates a branch and pull request from the approved edits. It does not merge the pull request.
				</p>
			</form>
		</div>
	);
}
