import { FileText, GitBranch, ListChecks, SearchCode, ShieldCheck } from "lucide-react";

const steps = [
	{ title: "Describe the change", detail: "Start with the requirement", Icon: FileText },
	{ title: "Use repository context", detail: "Ground the plan in your code", Icon: SearchCode },
	{ title: "Build a draft", detail: "Review the plan before code", Icon: ListChecks },
	{ title: "Run verification", detail: "Check changes in isolation", Icon: ShieldCheck },
	{ title: "You approve", detail: "A pull request comes after", Icon: GitBranch },
];

export function WelcomeWorkflow() {
	return (
		<section aria-labelledby="workflow-map-title" className="workflow-art welcome-process rounded-2xl border border-border bg-card p-5 sm:p-8 lg:p-9">
			<div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5 sm:items-center sm:pb-6">
				<div className="flex items-start gap-3 sm:items-center">
					<span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/5 text-primary">
						<GitBranch className="size-5" />
					</span>
					<div>
						<h2 id="workflow-map-title" className="text-lg font-semibold sm:text-xl">A change you can follow, step by step.</h2>
						<p className="mt-1 text-sm text-muted-foreground">Your repository stays the source of truth. You stay in control.</p>
					</div>
				</div>
				<span className="ml-[3.25rem] rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground sm:ml-0">Illustrative workflow</span>
			</div>

			<div className="welcome-request mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-muted/60 px-4 py-3 sm:mt-6 sm:px-5">
				<span className="shrink-0 text-xs font-semibold uppercase tracking-[0.08em] text-primary">Requirement</span>
				<p className="text-sm leading-6 text-foreground sm:text-base">“Keep existing records when an import contains duplicates.”</p>
			</div>

			<ol aria-label="Changeweft workflow" className="welcome-stages mt-7 sm:mt-9">
				{steps.map(({ title, detail, Icon }) => (
					<li key={title} className="welcome-stage">
						<span className="welcome-stage-node">
							<Icon aria-hidden="true" className="size-5" />
						</span>
						<span className="welcome-stage-copy">
							<span className="font-semibold text-foreground">{title}</span>
							<span className="mt-1 text-sm leading-5 text-muted-foreground">{detail}</span>
						</span>
					</li>
				))}
			</ol>

			<p className="mt-6 border-t border-border pt-4 text-sm leading-6 text-muted-foreground sm:mt-8 sm:pt-5">
				AI can prepare and verify a change. <span className="font-medium text-foreground">Only you can approve it.</span>
			</p>
		</section>
	);
}
