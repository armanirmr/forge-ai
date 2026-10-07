/** A run is current when no edit was created after it finished. */
export function isVerificationCurrent(runAt: Date, editTimes: Date[]): boolean {
	return editTimes.every((t) => t.getTime() <= runAt.getTime());
}

/** Reasons approval is not allowed right now. Empty means it is allowed. */
export function approvalBlockers(input: {
	workflowStatus: string;
	latestRunStatus: string | null;
	verificationCurrent: boolean;
}): string[] {
	const out: string[] = [];
	if (input.workflowStatus !== "changes_generated") {
		out.push(
			`Changes can only be approved while the workflow is in "changes_generated" (it is "${input.workflowStatus}")`,
		);
	}
	if (input.latestRunStatus === null) {
		out.push("Run verification first");
	} else if (input.latestRunStatus !== "passed") {
		out.push(
			`The latest verification ended as "${input.latestRunStatus}"; approval requires "passed"`,
		);
	} else if (!input.verificationCurrent) {
		out.push(
			"The latest verification is older than the latest edits; run it again",
		);
	}
	return out;
}
