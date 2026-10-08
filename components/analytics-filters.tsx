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
}: {
	repositories: RepositoryOption[];
	ranges: readonly RangeOption[];
	selectedRepositoryId: string;
	selectedRange: string;
}) {
	const router = useRouter();
	const pathname = usePathname();
	const [repository, setRepository] = useState(selectedRepositoryId);
	const [range, setRange] = useState(selectedRange);

	function applyFilters(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const query = new URLSearchParams({ repository, range });
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
				</select>
			</label>
			<Button type="submit">Apply</Button>
		</form>
	);
}
