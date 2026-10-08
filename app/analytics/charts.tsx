import type {
	AnalyticsBucket,
	DecisionDurationPoint,
	RepairFollowUpPoint,
	VerificationOutcomePoint,
	WorkflowActivityPoint,
} from "@/lib/analytics/series";
import type { ReactNode } from "react";

const chartColors = {
	active: "var(--chart-1)",
	review: "var(--chart-2)",
	approved: "var(--chart-4)",
	closed: "var(--destructive)",
};

const verificationColors = {
	passed: "var(--success)",
	failed: "var(--destructive)",
	error: "var(--chart-2)",
	notExecuted: "var(--chart-5)",
};

const periodLabel = (date: Date, bucket: AnalyticsBucket) => date.toLocaleDateString("en-US", {
	month: "short",
	day: bucket === "month" ? undefined : "numeric",
	year: bucket === "month" ? "2-digit" : undefined,
	timeZone: "UTC",
});
const numberLabel = (value: number) => value.toLocaleString("en-US");

function showPeriodLabel(index: number, count: number, bucket: AnalyticsBucket) {
	if (index === count - 1 || bucket === "month") return true;
	return index % (bucket === "day" ? 5 : 2) === 0;
}

function ChartPanel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
	return (
		<section className="min-w-0 space-y-3 rounded-lg border border-border bg-card p-4 sm:p-5">
			<div>
				<h2 className="font-semibold">{title}</h2>
				<p className="mt-1 text-sm text-muted-foreground">{description}</p>
			</div>
			{children}
		</section>
	);
}

export function WorkflowActivityChart({ data, bucket, rangeLabel }: { data: WorkflowActivityPoint[]; bucket: AnalyticsBucket; rangeLabel: string }) {
	const total = data.reduce((sum, point) => sum + point.active + point.review + point.approved + point.closed, 0);
	const keys = ["active", "review", "approved", "closed"] as const;
	const labels = { active: "In progress", review: "Ready for review", approved: "Approved", closed: "Rejected or failed" };
	const maximum = Math.max(1, ...data.map((point) => keys.reduce((sum, key) => sum + point[key], 0)));
	const scale = Math.ceil(maximum / 4);
	const axisMax = Math.max(4, scale * 4);
	const plot = { left: 48, right: 704, top: 16, bottom: 206 };
	const plotHeight = plot.bottom - plot.top;
	const slotWidth = (plot.right - plot.left) / data.length;
	const barWidth = Math.min(38, slotWidth * 0.58);

	return (
		<ChartPanel title="Workflows over time" description={`Workflows created per ${bucket}, grouped by their current state. ${rangeLabel}`}>
			{total === 0 ? <ChartEmpty>No workflows were created during this period.</ChartEmpty> : (
				<>
					<div role="img" aria-label={`Stacked chart of ${numberLabel(total)} workflows by ${bucket} and current state`}>
						<svg viewBox="0 0 720 252" className="h-auto w-full" aria-hidden="true">
							{Array.from({ length: 5 }, (_, tick) => {
								const value = axisMax * tick / 4;
								const y = plot.bottom - plotHeight * tick / 4;
								return <g key={tick}><line x1={plot.left} x2={plot.right} y1={y} y2={y} stroke="var(--border)" strokeDasharray={tick === 0 ? undefined : "3 5"} /><text x={plot.left - 10} y={y + 4} textAnchor="end" fill="var(--muted-foreground)" fontSize="11">{Math.round(value)}</text></g>;
							})}
							{data.map((point, index) => {
								const x = plot.left + slotWidth * index + (slotWidth - barWidth) / 2;
								let offset = 0;
								return <g key={point.periodStart.toISOString()}>
									{keys.map((key) => {
										const height = point[key] / axisMax * plotHeight;
										const y = plot.bottom - offset - height;
										offset += height;
										return height > 0 ? <rect key={key} x={x} y={y} width={barWidth} height={height} fill={chartColors[key]}><title>{`${periodLabel(point.periodStart, bucket)}: ${point[key]} ${labels[key].toLowerCase()}`}</title></rect> : null;
									})}
									{showPeriodLabel(index, data.length, bucket) && <text x={x + barWidth / 2} y={plot.bottom + 22} textAnchor="middle" fill="var(--muted-foreground)" fontSize="15">{periodLabel(point.periodStart, bucket)}</text>}
								</g>;
							})}
						</svg>
					</div>
					<ul aria-label="Workflow states" className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
						{keys.map((key) => <li key={key} className="flex items-center gap-2"><span aria-hidden="true" className="size-2.5 rounded-sm" style={{ backgroundColor: chartColors[key] }} />{labels[key]}</li>)}
					</ul>
					<table className="sr-only"><caption>Workflows by period and current state</caption><thead><tr><th>Period starting</th>{keys.map((key) => <th key={key}>{labels[key]}</th>)}</tr></thead><tbody>{data.map((point) => <tr key={point.periodStart.toISOString()}><th>{periodLabel(point.periodStart, bucket)}</th>{keys.map((key) => <td key={key}>{point[key]}</td>)}</tr>)}</tbody></table>
				</>
			)}
		</ChartPanel>
	);
}

export function VerificationOutcomeChart({ data, bucket, rangeLabel }: { data: VerificationOutcomePoint[]; bucket: AnalyticsBucket; rangeLabel: string }) {
	const keys = ["passed", "failed", "error", "notExecuted"] as const;
	const labels = { passed: "Passed", failed: "Failed", error: "Error", notExecuted: "Not executed" };
	const total = data.reduce((sum, point) => sum + keys.reduce((periodTotal, key) => periodTotal + point[key], 0), 0);
	const maximum = Math.max(1, ...data.map((point) => keys.reduce((sum, key) => sum + point[key], 0)));
	const axisMax = Math.max(4, Math.ceil(maximum / 4) * 4);
	const plot = { left: 48, right: 704, top: 16, bottom: 206 };
	const plotHeight = plot.bottom - plot.top;
	const slotWidth = (plot.right - plot.left) / Math.max(1, data.length);
	const barWidth = Math.min(38, slotWidth * 0.58);

	return (
		<ChartPanel title="Verification outcomes" description={`Verification runs by ${bucket}. ${rangeLabel}`}>
			{total === 0 ? <ChartEmpty>No verification runs were recorded during this period.</ChartEmpty> : (
				<>
					<div role="img" aria-label={`Stacked chart of ${numberLabel(total)} verification runs by ${bucket} and outcome`}>
						<svg viewBox="0 0 720 252" className="h-auto w-full" aria-hidden="true">
							{Array.from({ length: 5 }, (_, tick) => {
								const value = axisMax * tick / 4;
								const y = plot.bottom - plotHeight * tick / 4;
								return <g key={tick}><line x1={plot.left} x2={plot.right} y1={y} y2={y} stroke="var(--border)" strokeDasharray={tick === 0 ? undefined : "3 5"} /><text x={plot.left - 10} y={y + 4} textAnchor="end" fill="var(--muted-foreground)" fontSize="11">{Math.round(value)}</text></g>;
							})}
							{data.map((point, index) => {
								const x = plot.left + slotWidth * index + (slotWidth - barWidth) / 2;
								let offset = 0;
								return <g key={point.periodStart.toISOString()}>
									{keys.map((key) => {
										const height = point[key] / axisMax * plotHeight;
										const y = plot.bottom - offset - height;
										offset += height;
										return height > 0 ? <rect key={key} x={x} y={y} width={barWidth} height={height} fill={verificationColors[key]}><title>{`${periodLabel(point.periodStart, bucket)}: ${point[key]} ${labels[key].toLowerCase()}`}</title></rect> : null;
									})}
									{showPeriodLabel(index, data.length, bucket) && <text x={x + barWidth / 2} y={plot.bottom + 22} textAnchor="middle" fill="var(--muted-foreground)" fontSize="15">{periodLabel(point.periodStart, bucket)}</text>}
								</g>;
							})}
						</svg>
					</div>
					<ul aria-label="Verification outcomes" className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
						{keys.map((key) => <li key={key} className="flex items-center gap-2"><span aria-hidden="true" className="size-2.5 rounded-sm" style={{ backgroundColor: verificationColors[key] }} />{labels[key]}</li>)}
					</ul>
					<table className="sr-only"><caption>Verification runs by period and outcome</caption><thead><tr><th>Period starting</th>{keys.map((key) => <th key={key}>{labels[key]}</th>)}</tr></thead><tbody>{data.map((point) => <tr key={point.periodStart.toISOString()}><th>{periodLabel(point.periodStart, bucket)}</th>{keys.map((key) => <td key={key}>{point[key]}</td>)}</tr>)}</tbody></table>
				</>
			)}
		</ChartPanel>
	);
}

export function RepairFollowUpChart({ data, bucket, rangeLabel }: { data: RepairFollowUpPoint[]; bucket: AnalyticsBucket; rangeLabel: string }) {
	const populated = data.filter((point) => point.rate !== null);
	const plot = { left: 56, right: 704, top: 16, bottom: 206 };
	const slotWidth = (plot.right - plot.left) / Math.max(1, data.length - 1);
	const pointY = (rate: number) => plot.bottom - rate * (plot.bottom - plot.top);
	const segments = data.slice(1).flatMap((point, index) => {
		const previous = data[index];
		if (previous.rate === null || point.rate === null) return [];
		return [`${plot.left + index * slotWidth},${pointY(previous.rate)} ${plot.left + (index + 1) * slotWidth},${pointY(point.rate)}`];
	});

	return (
		<ChartPanel title="Repairs followed by a pass" description={`Share of repair attempts with a linked verification that passed, by ${bucket}. ${rangeLabel}`}>
			{populated.length === 0 ? <ChartEmpty>No repair attempts with a follow-up verification were recorded during this period.</ChartEmpty> : (
				<>
					<div role="img" aria-label={`Line chart showing the share of repair attempts followed by passing verification, by ${bucket}`}>
						<svg viewBox="0 0 720 252" className="h-auto w-full" aria-hidden="true">
							{[0, 0.5, 1].map((fraction) => {
								const y = pointY(fraction);
								return <g key={fraction}><line x1={plot.left} x2={plot.right} y1={y} y2={y} stroke="var(--border)" strokeDasharray={fraction === 0 ? undefined : "3 5"} /><text x={plot.left - 10} y={y + 4} textAnchor="end" fill="var(--muted-foreground)" fontSize="11">{Math.round(fraction * 100)}%</text></g>;
							})}
							{segments.map((segment, index) => <polyline key={index} points={segment} fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />)}
							{data.map((point, index) => {
								const x = plot.left + index * slotWidth;
								return <g key={point.periodStart.toISOString()}>
									{point.rate !== null && <><circle cx={x} cy={pointY(point.rate)} r="5" fill="var(--card)" stroke="var(--success)" strokeWidth="2.5"><title>{`${periodLabel(point.periodStart, bucket)}: ${Math.round(point.rate * 100)}%, ${point.passed} of ${point.followed} follow-up verifications passed`}</title></circle>{showPeriodLabel(index, data.length, bucket) && <text x={x} y={plot.bottom + 40} textAnchor="middle" fill="var(--muted-foreground)" fontSize="12">n={point.followed}</text>}</>}
									{showPeriodLabel(index, data.length, bucket) && <text x={x} y={plot.bottom + 22} textAnchor="middle" fill="var(--muted-foreground)" fontSize="15">{periodLabel(point.periodStart, bucket)}</text>}
								</g>;
							})}
						</svg>
					</div>
					<p className="text-xs text-muted-foreground">n is the number of attempts with a linked verification. Attempts without a recorded follow-up are excluded; each result is grouped by the repair date.</p>
					<table className="sr-only"><caption>Repair follow-up verification outcomes by period</caption><thead><tr><th>Period starting</th><th>Pass rate</th><th>Passed</th><th>Follow-up verifications</th></tr></thead><tbody>{data.map((point) => <tr key={point.periodStart.toISOString()}><th>{periodLabel(point.periodStart, bucket)}</th><td>{point.rate === null ? "No follow-up verifications" : `${Math.round(point.rate * 100)}%`}</td><td>{point.passed}</td><td>{point.followed}</td></tr>)}</tbody></table>
				</>
			)}
		</ChartPanel>
	);
}

function formatDuration(milliseconds: number): string {
	const minutes = milliseconds / 60_000;
	return minutes < 60 ? `${minutes.toFixed(0)} min` : `${(minutes / 60).toFixed(1)} hr`;
}

export function DecisionDurationChart({ data, bucket, rangeLabel }: { data: DecisionDurationPoint[]; bucket: AnalyticsBucket; rangeLabel: string }) {
	const populated = data.filter((point) => point.averageMs !== null);
	const maxMs = Math.max(1, ...populated.map((point) => point.averageMs ?? 0));
	const axisMax = Math.ceil(maxMs / (60 * 60 * 1000));
	const plot = { left: 68, right: 704, top: 16, bottom: 206 };
	const plotHeight = plot.bottom - plot.top;
	const slotWidth = (plot.right - plot.left) / Math.max(1, data.length - 1);
	const pointY = (milliseconds: number) => plot.bottom - milliseconds / (axisMax * 60 * 60 * 1000) * plotHeight;
	const segments = data.slice(1).flatMap((point, index) => {
		const previous = data[index];
		if (previous.averageMs === null || point.averageMs === null) return [];
		return [`${plot.left + index * slotWidth},${pointY(previous.averageMs)} ${plot.left + (index + 1) * slotWidth},${pointY(point.averageMs)}`];
	});

	return (
		<ChartPanel title="Time to decision" description={`Average time from workflow creation to approval or rejection, by ${bucket}. ${rangeLabel}`}>
			{populated.length === 0 ? <ChartEmpty>No approval or rejection decisions were recorded during this period.</ChartEmpty> : (
				<>
					<div role="img" aria-label={`Line chart of average time from workflow creation to human decision, by ${bucket}, with sample counts`}>
						<svg viewBox="0 0 720 252" className="h-auto w-full" aria-hidden="true">
							{[0, 0.5, 1].map((fraction) => {
								const y = plot.bottom - fraction * plotHeight;
								return <g key={fraction}><line x1={plot.left} x2={plot.right} y1={y} y2={y} stroke="var(--border)" strokeDasharray={fraction === 0 ? undefined : "3 5"} /><text x={plot.left - 10} y={y + 4} textAnchor="end" fill="var(--muted-foreground)" fontSize="11">{formatDuration(axisMax * fraction * 60 * 60 * 1000)}</text></g>;
							})}
							{segments.map((segment, index) => <polyline key={index} points={segment} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />)}
							{data.map((point, index) => {
								const x = plot.left + index * slotWidth;
								return <g key={point.periodStart.toISOString()}>
									{point.averageMs !== null && <><circle cx={x} cy={pointY(point.averageMs)} r="5" fill="var(--card)" stroke="var(--primary)" strokeWidth="2.5"><title>{`${periodLabel(point.periodStart, bucket)}: ${formatDuration(point.averageMs)} average, ${point.sampleCount} decisions`}</title></circle>{showPeriodLabel(index, data.length, bucket) && <text x={x} y={plot.bottom + 40} textAnchor="middle" fill="var(--muted-foreground)" fontSize="12">n={point.sampleCount}</text>}</>}
									{showPeriodLabel(index, data.length, bucket) && <text x={x} y={plot.bottom + 22} textAnchor="middle" fill="var(--muted-foreground)" fontSize="15">{periodLabel(point.periodStart, bucket)}</text>}
								</g>;
							})}
						</svg>
					</div>
					<p className="text-xs text-muted-foreground">Selected points show sample counts; periods without decisions are left unconnected. Full counts are available in the data table.</p>
					<table className="sr-only"><caption>Average time to decision by period</caption><thead><tr><th>Period starting</th><th>Average time</th><th>Decisions</th></tr></thead><tbody>{data.map((point) => <tr key={point.periodStart.toISOString()}><th>{periodLabel(point.periodStart, bucket)}</th><td>{point.averageMs === null ? "No decisions" : formatDuration(point.averageMs)}</td><td>{point.sampleCount}</td></tr>)}</tbody></table>
				</>
			)}
		</ChartPanel>
	);
}

function ChartEmpty({ children }: { children: ReactNode }) {
	return <p className="flex min-h-48 items-center justify-center rounded-md bg-muted/50 px-4 text-center text-sm text-muted-foreground">{children}</p>;
}
