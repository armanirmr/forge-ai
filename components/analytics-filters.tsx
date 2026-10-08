"use client";

import { useState, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type RepositoryOption = { id: string; owner: string; name: string };
type RangeOption = { value: string; label: string };

export function AnalyticsFilters({
	repositories,
	ranges,
	selectedRepositoryId,
	selectedRange,
	selectedFrom,
	selectedTo,
	maxDate,
}: {
	repositories: RepositoryOption[];
	ranges: readonly RangeOption[];
	selectedRepositoryId: string;
	selectedRange: string;
	selectedFrom: string;
	selectedTo: string;
	maxDate: string;
}) {
	const router = useRouter();
	const pathname = usePathname();
	const [repository, setRepository] = useState(selectedRepositoryId);
	const [range, setRange] = useState(selectedRange);
	const [from, setFrom] = useState(selectedFrom);
	const [to, setTo] = useState(selectedTo);

	function applyFilters(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const query = new URLSearchParams({ repository, range });
		if (range === "custom") {
			query.set("from", from);
			query.set("to", to);
		}
		router.push(`${pathname}?${query.toString()}`, { scroll: false });
	}

	return (
		<form onSubmit={applyFilters} className="flex flex-wrap items-end gap-3">
			<label className="grid gap-1 text-xs font-medium text-muted-foreground">
				Repository
				<select name="repository" value={repository} onChange={(event) => setRepository(event.target.value)} className="h-9 min-w-48 rounded-md border border-input bg-background px-3 text-sm font-normal text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
					<option value="all">All repositories</option>
					{repositories.map((item) => <option key={item.id} value={item.id}>{item.owner}/{item.name}</option>)}
				</select>
			</label>
			<label className="grid gap-1 text-xs font-medium text-muted-foreground">
				Time period
				<select name="range" value={range} onChange={(event) => setRange(event.target.value)} className="h-9 min-w-40 rounded-md border border-input bg-background px-3 text-sm font-normal text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
					{ranges.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
					<option value="custom">Custom range</option>
				</select>
			</label>
			{range === "custom" && (
				<fieldset className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-muted/35 p-3 pb-0">
					<legend className="px-1 text-xs font-medium text-foreground">Choose dates</legend>
					<label className="grid gap-1 text-xs font-medium text-muted-foreground">
						From
						<input type="date" name="from" required max={to || maxDate} value={from} onChange={(event) => setFrom(event.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
					</label>
					<label className="grid gap-1 text-xs font-medium text-muted-foreground">
						To
						<input type="date" name="to" required min={from || undefined} max={maxDate} value={to} onChange={(event) => setTo(event.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
					</label>
					<p className="sr-only">Includes both dates. The calendar opens from either date field.</p>
				</fieldset>
			)}
			<Button type="submit">Apply</Button>
		</form>
	);
}
