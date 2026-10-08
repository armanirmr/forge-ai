import { describe, expect, it } from "vitest";
import {
	buildDecisionDurationSeries,
	buildRepairFollowUpSeries,
	buildVerificationOutcomeSeries,
	buildWorkflowActivitySeries,
} from "./series";

const now = new Date("2026-10-08T12:00:00.000Z");
const start = new Date("2026-08-17T00:00:00.000Z");

describe("analytics time series", () => {
	it("groups workflows by selected period and current state, including empty weeks", () => {
		const series = buildWorkflowActivitySeries([
			{ status: "changes_approved", createdAt: new Date("2026-10-05T10:00:00.000Z") },
			{ status: "failed", createdAt: new Date("2026-10-06T10:00:00.000Z") },
			{ status: "cancelled", createdAt: new Date("2026-10-06T11:00:00.000Z") },
			{ status: "planning", createdAt: new Date("2026-09-28T10:00:00.000Z") },
			{ status: "changes_rejected", createdAt: new Date("2026-08-01T10:00:00.000Z") },
		], start, now, "week");

		expect(series).toHaveLength(8);
		expect(series.at(-1)).toMatchObject({ active: 0, review: 0, approved: 1, closed: 2 });
		expect(series.at(-2)).toMatchObject({ active: 1, review: 0, approved: 0, closed: 0 });
		expect(series[0]).toMatchObject({ active: 0, review: 0, approved: 0, closed: 0 });
	});

	it("averages decision duration by selected period and ignores incomplete weeks", () => {
		const series = buildDecisionDurationSeries([
			{ decidedAt: new Date("2026-10-05T12:00:00.000Z"), workflowCreatedAt: new Date("2026-10-05T10:00:00.000Z") },
			{ decidedAt: new Date("2026-10-06T12:00:00.000Z"), workflowCreatedAt: new Date("2026-10-05T12:00:00.000Z") },
			{ decidedAt: new Date("2026-10-07T12:00:00.000Z"), workflowCreatedAt: new Date("2026-10-08T12:00:00.000Z") },
		], start, now, "week");

		expect(series.at(-1)).toMatchObject({ averageMs: 13 * 60 * 60 * 1000, sampleCount: 2 });
		expect(series.at(-2)).toMatchObject({ averageMs: null, sampleCount: 0 });
	});

	it("returns daily and monthly buckets for the requested range", () => {
		const daily = buildWorkflowActivitySeries([], new Date("2026-10-01T12:00:00.000Z"), now, "day");
		const monthly = buildWorkflowActivitySeries([], new Date("2026-01-15T12:00:00.000Z"), now, "month");

		expect(daily).toHaveLength(8);
		expect(monthly).toHaveLength(10);
		expect(monthly[0].periodStart.toISOString()).toBe("2026-01-01T00:00:00.000Z");
	});

	it("counts verification outcomes in each selected period", () => {
		const series = buildVerificationOutcomeSeries([
			{ status: "passed", createdAt: new Date("2026-10-05T10:00:00.000Z") },
			{ status: "failed", createdAt: new Date("2026-10-06T10:00:00.000Z") },
			{ status: "error", createdAt: new Date("2026-09-28T10:00:00.000Z") },
			{ status: "not_executed", createdAt: new Date("2026-09-28T11:00:00.000Z") },
		], start, now, "week");

		expect(series.at(-1)).toMatchObject({ passed: 1, failed: 1, error: 0, notExecuted: 0 });
		expect(series.at(-2)).toMatchObject({ passed: 0, failed: 0, error: 1, notExecuted: 1 });
	});

	it("calculates follow-up pass rate only from attempts linked to a verification", () => {
		const series = buildRepairFollowUpSeries([
			{ createdAt: new Date("2026-10-05T10:00:00.000Z"), verificationStatus: "passed" },
			{ createdAt: new Date("2026-10-06T10:00:00.000Z"), verificationStatus: "failed" },
			{ createdAt: new Date("2026-10-06T11:00:00.000Z"), verificationStatus: "error" },
			{ createdAt: new Date("2026-10-06T12:00:00.000Z"), verificationStatus: null },
		], start, now, "week");

		expect(series.at(-1)).toMatchObject({ followed: 3, passed: 1, rate: 1 / 3 });
		expect(series.at(-2)).toMatchObject({ followed: 0, passed: 0, rate: null });
	});
});
