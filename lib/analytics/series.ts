export type WorkflowActivityInput = { status: string; createdAt: Date };
export type DecisionDurationInput = { decidedAt: Date; workflowCreatedAt: Date };
export type VerificationOutcomeInput = { status: string; createdAt: Date };
export type RepairFollowUpInput = { createdAt: Date; verificationStatus: string | null };
export type AnalyticsBucket = "day" | "week" | "month";

export type WorkflowActivityPoint = {
	periodStart: Date;
	active: number;
	review: number;
	approved: number;
	closed: number;
};

export type DecisionDurationPoint = {
	periodStart: Date;
	averageMs: number | null;
	sampleCount: number;
};

export type VerificationOutcomePoint = {
	periodStart: Date;
	passed: number;
	failed: number;
	error: number;
	notExecuted: number;
};

export type RepairFollowUpPoint = {
	periodStart: Date;
	followed: number;
	passed: number;
	rate: number | null;
};

function bucketStart(date: Date, bucket: AnalyticsBucket): Date {
	if (bucket === "month") return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
	const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
	if (bucket === "week") day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
	return day;
}

function nextBucket(date: Date, bucket: AnalyticsBucket): Date {
	const next = new Date(date);
	if (bucket === "month") next.setUTCMonth(next.getUTCMonth() + 1);
	else next.setUTCDate(next.getUTCDate() + (bucket === "week" ? 7 : 1));
	return next;
}

function createPeriods(start: Date, end: Date, bucket: AnalyticsBucket): Date[] {
	const periods: Date[] = [];
	for (let date = bucketStart(start, bucket); date <= end; date = nextBucket(date, bucket)) {
		periods.push(date);
	}
	return periods;
}

function periodIndex(date: Date, periods: Date[], bucket: AnalyticsBucket): number {
	const startTime = bucketStart(date, bucket).getTime();
	return periods.findIndex((period) => period.getTime() === startTime);
}

export function buildWorkflowActivitySeries(
	rows: WorkflowActivityInput[],
	start: Date,
	end: Date,
	bucket: AnalyticsBucket,
): WorkflowActivityPoint[] {
	const periods = createPeriods(start, end, bucket);
	const points = periods.map((periodStart) => ({ periodStart, active: 0, review: 0, approved: 0, closed: 0 }));
	const activeStatuses = new Set(["analyzing", "planning", "generating", "verifying", "repairing"]);
	const reviewStatuses = new Set(["analysis_completed", "plan_completed", "plan_approved", "changes_generated"]);

	for (const row of rows) {
		const index = periodIndex(row.createdAt, periods, bucket);
		if (index < 0 || row.createdAt < start || row.createdAt > end) continue;
		if (activeStatuses.has(row.status)) points[index].active += 1;
		else if (reviewStatuses.has(row.status)) points[index].review += 1;
		else if (row.status === "changes_approved") points[index].approved += 1;
		else if (row.status === "changes_rejected" || row.status === "failed" || row.status === "cancelled") points[index].closed += 1;
	}

	return points;
}

export function buildDecisionDurationSeries(
	rows: DecisionDurationInput[],
	start: Date,
	end: Date,
	bucket: AnalyticsBucket,
): DecisionDurationPoint[] {
	const periods = createPeriods(start, end, bucket);
	const points = periods.map((periodStart) => ({ periodStart, totalMs: 0, sampleCount: 0 }));

	for (const row of rows) {
		const index = periodIndex(row.decidedAt, periods, bucket);
		if (index < 0 || row.decidedAt < start || row.decidedAt > end) continue;
		const duration = row.decidedAt.getTime() - row.workflowCreatedAt.getTime();
		if (duration < 0) continue;
		points[index].totalMs += duration;
		points[index].sampleCount += 1;
	}

	return points.map(({ periodStart, totalMs, sampleCount }) => ({
		periodStart,
		averageMs: sampleCount ? totalMs / sampleCount : null,
		sampleCount,
	}));
}

export function buildVerificationOutcomeSeries(
	rows: VerificationOutcomeInput[],
	start: Date,
	end: Date,
	bucket: AnalyticsBucket,
): VerificationOutcomePoint[] {
	const periods = createPeriods(start, end, bucket);
	const points = periods.map((periodStart) => ({ periodStart, passed: 0, failed: 0, error: 0, notExecuted: 0 }));
	const statusKeys: Record<string, keyof Omit<VerificationOutcomePoint, "periodStart">> = {
		passed: "passed",
		failed: "failed",
		error: "error",
		not_executed: "notExecuted",
	};

	for (const row of rows) {
		const index = periodIndex(row.createdAt, periods, bucket);
		const key = statusKeys[row.status];
		if (index < 0 || !key || row.createdAt < start || row.createdAt > end) continue;
		points[index][key] += 1;
	}

	return points;
}

export function buildRepairFollowUpSeries(
	rows: RepairFollowUpInput[],
	start: Date,
	end: Date,
	bucket: AnalyticsBucket,
): RepairFollowUpPoint[] {
	const periods = createPeriods(start, end, bucket);
	const points = periods.map((periodStart) => ({ periodStart, followed: 0, passed: 0, rate: null as number | null }));

	for (const row of rows) {
		const index = periodIndex(row.createdAt, periods, bucket);
		if (index < 0 || row.createdAt < start || row.createdAt > end || row.verificationStatus === null) continue;
		points[index].followed += 1;
		if (row.verificationStatus === "passed") points[index].passed += 1;
	}

	return points.map((point) => ({
		...point,
		rate: point.followed ? point.passed / point.followed : null,
	}));
}
