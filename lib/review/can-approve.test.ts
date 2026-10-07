import { describe, expect, it } from "vitest";
import { approvalBlockers, isVerificationCurrent } from "./can-approve";

const ok = {
	workflowStatus: "changes_generated",
	latestRunStatus: "passed",
	verificationCurrent: true,
};

describe("approvalBlockers", () => {
	it("allows a passed, current verification on a generated change set", () => {
		expect(approvalBlockers(ok)).toEqual([]);
	});

	it("blocks other workflow states", () => {
		expect(
			approvalBlockers({ ...ok, workflowStatus: "repairing" })[0],
		).toContain("changes_generated");
	});

	it("requires a verification run", () => {
		expect(approvalBlockers({ ...ok, latestRunStatus: null })).toEqual([
			"Run verification first",
		]);
	});

	it("requires the latest run to have passed", () => {
		expect(approvalBlockers({ ...ok, latestRunStatus: "failed" })[0]).toContain(
			'"failed"',
		);
		expect(
			approvalBlockers({ ...ok, latestRunStatus: "not_executed" })[0],
		).toContain("requires");
	});

	it("blocks a passed run that is older than the edits", () => {
		expect(
			approvalBlockers({ ...ok, verificationCurrent: false })[0],
		).toContain("older");
	});
});

describe("isVerificationCurrent", () => {
	const run = new Date("2026-10-07T10:00:00Z");
	it("is current when every edit is not newer than the run", () => {
		expect(
			isVerificationCurrent(run, [new Date("2026-10-07T09:00:00Z"), run]),
		).toBe(true);
		expect(isVerificationCurrent(run, [])).toBe(true);
	});
	it("is stale when an edit is newer than the run", () => {
		expect(isVerificationCurrent(run, [new Date("2026-10-07T11:00:00Z")])).toBe(
			false,
		);
	});
});
