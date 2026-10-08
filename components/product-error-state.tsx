"use client";

import Link from "next/link";
import { ArrowLeft, GitBranch, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type ProductErrorStateProps = {
	title: string;
	description: string;
	reset?: () => void;
	resetLabel?: string;
	showBackLink?: boolean;
};

export function ProductErrorState({
	title,
	description,
	reset,
	resetLabel = "Try again",
	showBackLink = true,
}: ProductErrorStateProps) {
	return (
		<main className="mx-auto flex w-full max-w-3xl flex-1 items-center px-5 py-16 sm:px-8 sm:py-24">
			<div className="w-full">
				<Link href="/repositories" className="mb-8 inline-flex items-center gap-2 rounded-sm text-lg font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring">
					<span aria-hidden="true" className="grid size-8 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground">C</span>
					Changeweft
				</Link>
				<section aria-labelledby="recovery-title" className="w-full border-y border-border py-10 sm:py-14">
				<div aria-hidden="true" className="mb-8 flex items-center gap-3 text-primary">
					<span className="grid size-12 place-items-center rounded-xl border border-primary/20 bg-primary/5">
						<GitBranch className="size-6" />
					</span>
					<span className="h-px w-14 bg-border" />
					<span className="size-2 rounded-full bg-destructive/80" />
					<span className="h-px w-14 bg-border" />
					<span className="size-2 rounded-full border border-border bg-background" />
				</div>
				<p className="text-sm font-semibold text-primary">CHANGEWEFT · RECOVERY</p>
				<h1 id="recovery-title" className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
				<p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">{description}</p>
				<div className="mt-8 flex flex-wrap items-center gap-3">
					{reset && (
						<Button type="button" onClick={reset}>
							<RefreshCw aria-hidden="true" />
							{resetLabel}
						</Button>
					)}
					{showBackLink && (
						<Link href="/repositories" className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
							<ArrowLeft aria-hidden="true" className="size-4" />
							Back to repositories
						</Link>
					)}
				</div>
				</section>
			</div>
		</main>
	);
}
