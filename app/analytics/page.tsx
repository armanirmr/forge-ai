import { count, desc, eq, sql, sum } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ProductHeader } from "@/components/product-header";
import { aiRuns, changeApprovals, codeChanges, repairAttempts, repositories, verificationRuns, workflows } from "@/lib/db/schema";
import { db } from "@/lib/db";
import { getOwnedWorkflowScope } from "@/lib/security/tenant-access";

const number = (value: number | string | null | undefined) => Number(value ?? 0);
const formatCount = (value: number) => value.toLocaleString();
const formatTokens = (value: number) => value.toLocaleString();

function isTestPath(path: string): boolean {
	return /(?:^|[\\/])(?:tests?|__tests__)(?:[\\/]|$)|\.(?:test|spec)\.[^\\/]+$/i.test(path);
}

export default async function AnalyticsPage() {
	const session = await auth();
	if (!session) redirect("/");
	const userId = session.user.id;
	const ownerScope = getOwnedWorkflowScope(userId);

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
		.where(ownerScope);
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
		.where(ownerScope)
		.groupBy(aiRuns.agent)
		.orderBy(desc(count()));
	const repairsByStatus = await db
		.select({ status: repairAttempts.status, total: count() })
		.from(repairAttempts)
		.innerJoin(workflows, eq(repairAttempts.workflowId, workflows.id))
		.innerJoin(repositories, eq(workflows.repositoryId, repositories.id))
		.where(ownerScope)
		.groupBy(repairAttempts.status);
	const verificationsByStatus = await db
		.select({ status: verificationRuns.status, total: count() })
		.from(verificationRuns)
		.innerJoin(workflows, eq(verificationRuns.workflowId, workflows.id))
		.innerJoin(repositories, eq(workflows.repositoryId, repositories.id))
		.where(ownerScope)
		.groupBy(verificationRuns.status);
	const verificationSteps = await db
		.select({
			testSteps: sql<string[]>`jsonb_path_query_array(${verificationRuns.result}, '$.steps[*].name')`,
		})
		.from(verificationRuns)
		.innerJoin(workflows, eq(verificationRuns.workflowId, workflows.id))
		.innerJoin(repositories, eq(workflows.repositoryId, repositories.id))
		.where(ownerScope);
	const generatedPaths = await db
		.select({
			workflowId: codeChanges.workflowId,
			paths: sql<string[]>`jsonb_path_query_array(${codeChanges.result}, '$.edits[*].path')`,
		})
		.from(codeChanges)
		.innerJoin(workflows, eq(codeChanges.workflowId, workflows.id))
		.innerJoin(repositories, eq(workflows.repositoryId, repositories.id))
		.where(ownerScope);
	const decisions = await db
		.select({
			decision: changeApprovals.decision,
			decidedAt: changeApprovals.createdAt,
			workflowCreatedAt: workflows.createdAt,
		})
		.from(changeApprovals)
		.innerJoin(workflows, eq(changeApprovals.workflowId, workflows.id))
		.innerJoin(repositories, eq(workflows.repositoryId, repositories.id))
		.where(ownerScope);
	const workflowStatuses = await db
		.select({ status: workflows.status, total: count() })
		.from(workflows)
		.innerJoin(repositories, eq(workflows.repositoryId, repositories.id))
		.where(ownerScope)
		.groupBy(workflows.status);
	const [workflowTotal] = await db.select({ total: count() }).from(workflows)
		.innerJoin(repositories, eq(workflows.repositoryId, repositories.id))
		.where(ownerScope);
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
		.where(ownerScope)
		.orderBy(desc(aiRuns.createdAt))
		.limit(10);

	const repairs = Object.fromEntries(repairsByStatus.map((row) => [row.status, number(row.total)]));
	const verificationCounts = Object.fromEntries(
		verificationsByStatus.map((row) => [row.status, number(row.total)]),
	);
	const approved = decisions.filter((row) => row.decision === "approved").length;
	const rejected = decisions.filter((row) => row.decision === "rejected").length;
	const decided = approved + rejected;
	const durations = decisions.map(
		(row) => row.decidedAt.getTime() - row.workflowCreatedAt.getTime(),
	);
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
			<header className="flex flex-wrap items-center justify-between gap-4">
				<div className="space-y-1">
					<h1 className="text-2xl font-semibold">Workflow analytics</h1>
					<p className="text-sm text-muted-foreground">All recorded workflows and AI activity in this ForgeAI workspace.</p>
				</div>
			</header>

			<section aria-label="Key metrics" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<Metric title="AI runs" value={formatCount(number(runTotals?.runs))} detail={`${runsByAgent.length} agent types`} />
				<Metric title="Tokens used" value={formatTokens(totalInputTokens + totalOutputTokens)} detail={`${formatTokens(totalInputTokens)} input · ${formatTokens(totalOutputTokens)} output`} />
				<Metric title="Approval rate" value={decided ? `${Math.round((approved / decided) * 100)}%` : "—"} detail={`${approved} approved · ${rejected} rejected`} />
				<Metric title="Workflow duration" value={averageDuration} detail={`Average for ${durations.length} decided workflows`} />
				<Metric title="Accepted fixes" value={formatCount(repairs.accepted ?? 0)} detail={`${formatCount(repairs.rejected ?? 0)} rejected · ${formatCount(repairs.stopped ?? 0)} stopped`} />
				<Metric title="Debug iterations" value={formatCount(totalRepairs)} detail="Recorded repair attempts" />
				<Metric title="Test files in generated changes" value={formatCount(testFiles)} detail="Unique workflow and test-file paths touched by generated edits" />
				<Metric title="Test executions" value={formatCount(testExecutions)} detail={`${formatCount(verificationCounts.passed ?? 0)} passed verification runs overall`} />
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
				<p className="text-xs text-muted-foreground">Test metrics count test-file paths in saved code-generation edits and verification steps named “test.” They do not count test cases. Approval rate includes decided workflows only; duration runs from workflow creation to the approval or rejection.</p>
			</section>
		</main>
		</>
	);
}

function Metric({ title, value, detail }: { title: string; value: string; detail: string }) {
	return <article className="space-y-1 rounded border p-4"><h2 className="text-sm text-muted-foreground">{title}</h2><p className="text-2xl font-semibold">{value}</p><p className="text-xs text-muted-foreground">{detail}</p></article>;
}

function Empty() {
	return <p className="text-sm text-muted-foreground">No data recorded yet.</p>;
}
