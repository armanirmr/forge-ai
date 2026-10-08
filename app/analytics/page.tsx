import { and, count, desc, eq, gte, lte, sql, sum } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ProductHeader } from "@/components/product-header";
import { AnalyticsFilters } from "@/components/analytics-filters";
import { HelpTooltip } from "@/components/ui/tooltip";
import { aiRuns, changeApprovals, codeChanges, repairAttempts, repositories, verificationRuns, workflows } from "@/lib/db/schema";
import { db } from "@/lib/db";
import { getOwnedWorkflowScope } from "@/lib/security/tenant-access";
import {
	buildDecisionDurationSeries,
	buildRepairFollowUpSeries,
	buildVerificationOutcomeSeries,
	buildWorkflowActivitySeries,
	type AnalyticsBucket,
} from "@/lib/analytics/series";
import { analyticsRanges, resolveAnalyticsDateRange } from "@/lib/analytics/date-range";
import { DecisionDurationChart, RepairFollowUpChart, VerificationOutcomeChart, WorkflowActivityChart } from "./charts";

const number = (value: number | string | null | undefined) => Number(value ?? 0);
const formatCount = (value: number) => value.toLocaleString();
const formatTokens = (value: number) => value.toLocaleString();
function isTestPath(path: string): boolean {
	return /(?:^|[\\/])(?:tests?|__tests__)(?:[\\/]|$)|\.(?:test|spec)\.[^\\/]+$/i.test(path);
}

export default async function AnalyticsPage({
	searchParams,
}: {
	searchParams: Promise<{ range?: string; repository?: string; from?: string; to?: string }>;
}) {
	const session = await auth();
	if (!session) redirect("/");
	const userId = session.user.id;
	const ownerScope = getOwnedWorkflowScope(userId);
	const query = await searchParams;
	const resolvedRange = resolveAnalyticsDateRange(query.range, query.from, query.to);
	const rangeStart = resolvedRange.rangeStart;
	const rangeEnd = resolvedRange.rangeEnd;
	const chartBucket: AnalyticsBucket = resolvedRange.bucket;
	const ownedRepositories = await db.select({ id: repositories.id, owner: repositories.owner, name: repositories.name })
		.from(repositories)
		.where(eq(repositories.ownerUserId, userId))
		.orderBy(repositories.owner, repositories.name);
	const selectedRepositoryId = ownedRepositories.some((repository) => repository.id === query.repository)
		? query.repository!
		: "all";
	const eventScope = <TColumn extends AnyPgColumn>(eventAt: TColumn) => and(
		ownerScope,
		selectedRepositoryId === "all" ? undefined : eq(repositories.id, selectedRepositoryId),
		gte(eventAt, rangeStart),
		lte(eventAt, rangeEnd),
	);
	const rangeLabel = resolvedRange.label;

	const runCount = count();
	const [runTotals] = await db
		.select({
			runs: runCount,
			inputTokens: sum(aiRuns.inputTokens),
			outputTokens: sum(aiRuns.outputTokens),
		})
		.from(aiRuns)
		.innerJoin(workflows, eq(aiRuns.workflowId, workflows.id))
		.innerJoin(repositories, eq(workflows.repositoryId, repositories.id))
		.where(eventScope(aiRuns.createdAt));
	const runsByAgent = await db
		.select({
			agent: aiRuns.agent,
			runs: count(),
			inputTokens: sum(aiRuns.inputTokens),
			outputTokens: sum(aiRuns.outputTokens),
		})
		.from(aiRuns)
		.innerJoin(workflows, eq(aiRuns.workflowId, workflows.id))
		.innerJoin(repositories, eq(workflows.repositoryId, repositories.id))
		.where(eventScope(aiRuns.createdAt))
		.groupBy(aiRuns.agent)
		.orderBy(desc(count()));
	const repairRows = await db
		.select({
			status: repairAttempts.status,
			createdAt: repairAttempts.createdAt,
			verificationStatus: verificationRuns.status,
		})
		.from(repairAttempts)
		.leftJoin(verificationRuns, eq(repairAttempts.resultRunId, verificationRuns.id))
		.innerJoin(workflows, eq(repairAttempts.workflowId, workflows.id))
		.innerJoin(repositories, eq(workflows.repositoryId, repositories.id))
		.where(eventScope(repairAttempts.createdAt));
	const verificationSteps = await db
		.select({
			status: verificationRuns.status,
			createdAt: verificationRuns.createdAt,
			testSteps: sql<string[]>`jsonb_path_query_array(${verificationRuns.result}, '$.steps[*].name')`,
		})
		.from(verificationRuns)
		.innerJoin(workflows, eq(verificationRuns.workflowId, workflows.id))
		.innerJoin(repositories, eq(workflows.repositoryId, repositories.id))
		.where(eventScope(verificationRuns.createdAt));
	const generatedPaths = await db
		.select({
			workflowId: codeChanges.workflowId,
			paths: sql<string[]>`jsonb_path_query_array(${codeChanges.result}, '$.edits[*].path')`,
		})
		.from(codeChanges)
		.innerJoin(workflows, eq(codeChanges.workflowId, workflows.id))
		.innerJoin(repositories, eq(workflows.repositoryId, repositories.id))
		.where(eventScope(codeChanges.createdAt));
	const decisions = await db
		.select({
			decision: changeApprovals.decision,
			decidedAt: changeApprovals.createdAt,
			workflowCreatedAt: workflows.createdAt,
		})
		.from(changeApprovals)
		.innerJoin(workflows, eq(changeApprovals.workflowId, workflows.id))
		.innerJoin(repositories, eq(workflows.repositoryId, repositories.id))
		.where(eventScope(changeApprovals.createdAt));
	const workflowStatuses = await db
		.select({ status: workflows.status, total: count() })
		.from(workflows)
		.innerJoin(repositories, eq(workflows.repositoryId, repositories.id))
		.where(eventScope(workflows.createdAt))
		.groupBy(workflows.status);
	const filteredWorkflows = await db
		.select({ status: workflows.status, createdAt: workflows.createdAt })
		.from(workflows)
		.innerJoin(repositories, eq(workflows.repositoryId, repositories.id))
		.where(eventScope(workflows.createdAt));
	const [workflowTotal] = await db.select({ total: count() }).from(workflows)
		.innerJoin(repositories, eq(workflows.repositoryId, repositories.id))
		.where(eventScope(workflows.createdAt));
	const latestRuns = await db
		.select({
			agent: aiRuns.agent,
			model: aiRuns.model,
			status: aiRuns.status,
			inputTokens: aiRuns.inputTokens,
			outputTokens: aiRuns.outputTokens,
			createdAt: aiRuns.createdAt,
		})
		.from(aiRuns)
		.innerJoin(workflows, eq(aiRuns.workflowId, workflows.id))
		.innerJoin(repositories, eq(workflows.repositoryId, repositories.id))
		.where(eventScope(aiRuns.createdAt))
		.orderBy(desc(aiRuns.createdAt))
		.limit(10);

	const repairs = Object.fromEntries(["accepted", "rejected", "stopped"].map((status) => [
		status,
		repairRows.filter((row) => row.status === status).length,
	]));
	const verificationCounts = Object.fromEntries(["passed", "failed", "error", "not_executed"].map((status) => [
		status,
		verificationSteps.filter((row) => row.status === status).length,
	]));
	const approved = decisions.filter((row) => row.decision === "approved").length;
	const rejected = decisions.filter((row) => row.decision === "rejected").length;
	const decided = approved + rejected;
	const durations = decisions.map(
		(row) => row.decidedAt.getTime() - row.workflowCreatedAt.getTime(),
	);
	const workflowActivity = buildWorkflowActivitySeries(filteredWorkflows, rangeStart, rangeEnd, chartBucket);
	const decisionDurations = buildDecisionDurationSeries(decisions.map((row) => ({
		decidedAt: row.decidedAt,
		workflowCreatedAt: row.workflowCreatedAt,
	})), rangeStart, rangeEnd, chartBucket);
	const verificationOutcomes = buildVerificationOutcomeSeries(verificationSteps, rangeStart, rangeEnd, chartBucket);
	const repairFollowUps = buildRepairFollowUpSeries(repairRows, rangeStart, rangeEnd, chartBucket);
	const averageDurationMs = durations.length
		? durations.reduce((total, value) => total + value, 0) / durations.length
		: null;
	const testExecutions = verificationSteps.reduce(
		(total, row) => total + (row.testSteps ?? []).filter((name) => name.toLowerCase() === "test").length,
		0,
	);
	const testFiles = new Set(
		generatedPaths.flatMap((row) =>
			(row.paths ?? []).filter(isTestPath).map((path) => `${row.workflowId}:${path}`),
		),
	).size;
	const totalRepairs = Object.values(repairs).reduce((total, value) => total + value, 0);
	const totalInputTokens = number(runTotals?.inputTokens);
	const totalOutputTokens = number(runTotals?.outputTokens);
	const averageDuration = averageDurationMs === null
		? "No completed decisions yet"
		: averageDurationMs < 60 * 60 * 1000
			? `${(averageDurationMs / 60_000).toFixed(1)} min`
			: `${(averageDurationMs / 3_600_000).toFixed(1)} hr`;

	return (
		<>
		<ProductHeader active="analytics" />
		<main className="mx-auto w-full max-w-6xl space-y-8 p-6 sm:p-8">
			<header className="flex flex-wrap items-end justify-between gap-4">
				<div className="space-y-1">
					<h1 className="text-2xl font-semibold">Workflow analytics</h1>
					<p className="text-sm text-muted-foreground">Workflow and AI activity for the selected period.</p>
				</div>
				<AnalyticsFilters
					key={`${selectedRepositoryId}:${resolvedRange.value}:${resolvedRange.from}:${resolvedRange.to}`}
					repositories={ownedRepositories}
					ranges={analyticsRanges}
					selectedRepositoryId={selectedRepositoryId}
					selectedRange={resolvedRange.value}
					selectedFrom={resolvedRange.from}
					selectedTo={resolvedRange.to}
					maxDate={new Date().toISOString().slice(0, 10)}
				/>
			</header>
			{resolvedRange.invalidCustomRange && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">Choose valid dates for a range of 10 years or less. Showing the last 90 days until then.</p>}

			<section aria-label="Key metrics" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<Metric title="AI runs" value={formatCount(number(runTotals?.runs))} detail={`${runsByAgent.length} agent types`} help="Counts recorded AI attempts, including provider retries. It is not the number of workflows." />
				<Metric title="Tokens used" value={formatTokens(totalInputTokens + totalOutputTokens)} detail={`${formatTokens(totalInputTokens)} input · ${formatTokens(totalOutputTokens)} output`} help="Input and output tokens reported by the configured providers. Provider accounting may vary." />
				<Metric title="Approval rate" value={decided ? `${Math.round((approved / decided) * 100)}%` : "—"} detail={`${approved} approved · ${rejected} rejected`} help="Approved decisions divided by approvals plus rejections. Workflows without a decision are excluded." />
				<Metric title="Workflow duration" value={averageDuration} detail={`Average for ${durations.length} decided workflows`} help="Average time from workflow creation to its approval or rejection. It uses decisions recorded in the selected period." />
				<Metric title="Accepted fixes" value={formatCount(repairs.accepted ?? 0)} detail={`${formatCount(repairs.rejected ?? 0)} rejected · ${formatCount(repairs.stopped ?? 0)} stopped`} help="Repair suggestions that passed validation and were accepted into the draft. A passing check is reported separately." />
				<Metric title="Debug iterations" value={formatCount(totalRepairs)} detail="Recorded repair attempts" help="All recorded repair attempts, including accepted, rejected, and stopped suggestions." />
				<Metric title="Test files in generated changes" value={formatCount(testFiles)} detail="Unique workflow and test-file paths touched by generated edits" help="Unique changed file paths whose names match common test-file patterns. This does not measure test coverage or quality." />
				<Metric title="Test executions" value={formatCount(testExecutions)} detail={`${formatCount(verificationCounts.passed ?? 0)} passed verification runs overall`} help="Counts verification steps named exactly “test”. A step count is not a count of test cases." />
			</section>

			<section aria-label="Workflow trends" className="grid min-w-0 gap-6 lg:grid-cols-2">
				<WorkflowActivityChart data={workflowActivity} bucket={chartBucket} rangeLabel={rangeLabel} />
				<DecisionDurationChart data={decisionDurations} bucket={chartBucket} rangeLabel={rangeLabel} />
			</section>

			<section aria-label="Verification and repair outcomes" className="grid min-w-0 gap-6 lg:grid-cols-2">
				<VerificationOutcomeChart data={verificationOutcomes} bucket={chartBucket} rangeLabel={rangeLabel} />
				<RepairFollowUpChart data={repairFollowUps} bucket={chartBucket} rangeLabel={rangeLabel} />
			</section>

			<section className="grid gap-6 lg:grid-cols-2">
				<div className="space-y-3 rounded border p-4">
					<h2 className="font-semibold">AI usage by agent</h2>
					{runsByAgent.length === 0 ? <Empty /> : (
						<div className="overflow-x-auto">
							<table className="w-full text-left text-sm">
								<thead className="text-muted-foreground"><tr><th className="py-2">Agent</th><th>Runs</th><th>Input</th><th>Output</th></tr></thead>
								<tbody className="divide-y">
									{runsByAgent.map((row) => <tr key={row.agent}><td className="py-2 font-mono">{row.agent}</td><td>{formatCount(number(row.runs))}</td><td>{formatTokens(number(row.inputTokens))}</td><td>{formatTokens(number(row.outputTokens))}</td></tr>)}
								</tbody>
							</table>
						</div>
					)}
				</div>

				<div className="space-y-3 rounded border p-4">
					<h2 className="font-semibold">Workflow status</h2>
					<p className="text-sm text-muted-foreground">{formatCount(number(workflowTotal?.total))} workflows recorded</p>
					<ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
						{workflowStatuses.map((row) => <li key={row.status} className="rounded bg-muted p-2"><span className="font-medium">{formatCount(number(row.total))}</span><span className="ml-2 text-muted-foreground">{row.status.replaceAll("_", " ")}</span></li>)}
						{workflowStatuses.length === 0 && <li className="text-muted-foreground">No workflows yet.</li>}
					</ul>
				</div>
			</section>

			<section className="space-y-3 rounded border p-4">
				<h2 className="font-semibold">Recent AI runs</h2>
				{latestRuns.length === 0 ? <Empty /> : (
					<div className="overflow-x-auto">
						<table className="w-full text-left text-sm">
							<thead className="text-muted-foreground"><tr><th className="py-2">When</th><th>Agent</th><th>Model</th><th>Status</th><th>Tokens</th></tr></thead>
							<tbody className="divide-y">
								{latestRuns.map((row, index) => <tr key={`${row.agent}-${row.createdAt.toISOString()}-${index}`}><td className="py-2">{row.createdAt.toLocaleString()}</td><td className="font-mono">{row.agent}</td><td>{row.model}</td><td>{row.status.replaceAll("_", " ")}</td><td>{formatTokens(number(row.inputTokens) + number(row.outputTokens))}</td></tr>)}
							</tbody>
						</table>
					</div>
				)}
				<p className="text-xs text-muted-foreground">Filters apply to the recorded date for each event type. Time to decision includes the full time since workflow creation, even when that started before the selected period. Test metrics count test-file paths in saved code-generation edits and verification steps named “test”; they do not count test cases. Approval rate includes decided workflows only.</p>
			</section>
		</main>
		</>
	);
}

function Metric({ title, value, detail, help }: { title: string; value: string; detail: string; help: string }) {
	return <article className="space-y-1 rounded border p-4"><div className="flex items-center gap-1.5"><h2 className="text-sm text-muted-foreground">{title}</h2><HelpTooltip label={`About ${title}`}>{help}</HelpTooltip></div><p className="text-2xl font-semibold">{value}</p><p className="text-xs text-muted-foreground">{detail}</p></article>;
}

function Empty() {
	return <p className="text-sm text-muted-foreground">No data recorded yet.</p>;
}
