"use client";

import { useState, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type WorkflowStatus = { value: string; label: string };

export function WorkflowHistoryFilters({
	search,
	status,
	archive,
	codeQuery,
	statuses,
}: {
	search: string;
	status: string;
	archive: "active" | "archived";
	codeQuery: string;
	statuses: readonly WorkflowStatus[];
}) {
	const router = useRouter();
	const pathname = usePathname();
	const [historySearch, setHistorySearch] = useState(search);
	const [workflowStatus, setWorkflowStatus] = useState(status);
	const [workflowArchive, setWorkflowArchive] = useState(archive);

	function applyFilters(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const query = new URLSearchParams();
		if (historySearch.trim()) query.set("history", historySearch.trim());
		if (workflowStatus !== "all") query.set("workflowStatus", workflowStatus);
		if (workflowArchive !== "active") query.set("workflowArchive", workflowArchive);
		if (codeQuery) query.set("q", codeQuery);
		router.push(`${pathname}${query.size ? `?${query.toString()}` : ""}`, { scroll: false });
	}

	return (
		<form onSubmit={applyFilters} className="grid gap-3 sm:grid-cols-[minmax(12rem,1fr)_minmax(10rem,auto)_minmax(9rem,auto)_auto] sm:items-end">
			<label className="grid gap-1 text-xs font-medium text-muted-foreground">
				Search requirements
				<input
					value={historySearch}
					onChange={(event) => setHistorySearch(event.target.value)}
					maxLength={100}
					placeholder="Search workflow history"
					className="h-9 rounded-md border border-input bg-background px-3 text-sm font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
				/>
			</label>
			<label className="grid gap-1 text-xs font-medium text-muted-foreground">
				Workflow view
				<select value={workflowArchive} onChange={(event) => setWorkflowArchive(event.target.value as "active" | "archived")} className="h-9 rounded-md border border-input bg-background px-3 text-sm font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
					<option value="active">Active</option>
					<option value="archived">Archived</option>
				</select>
			</label>
			<label className="grid gap-1 text-xs font-medium text-muted-foreground">
				Status
				<select value={workflowStatus} onChange={(event) => setWorkflowStatus(event.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
					<option value="all">All statuses</option>
					{statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
				</select>
			</label>
			<Button type="submit">Filter</Button>
		</form>
	);
}
