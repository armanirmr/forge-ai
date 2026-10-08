"use client";

import { useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function ReviewDiffControls({ children }: { children: ReactNode }) {
	const filesRef = useRef<HTMLDivElement>(null);

	function setFilesExpanded(open: boolean) {
		filesRef.current?.querySelectorAll<HTMLDetailsElement>("details[data-review-file]")
			.forEach((file) => { file.open = open; });
	}

	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<p className="text-sm font-medium">Changed files</p>
				<div className="flex items-center gap-1">
					<Button type="button" variant="ghost" size="sm" onClick={() => setFilesExpanded(true)}>Expand all</Button>
					<Button type="button" variant="ghost" size="sm" onClick={() => setFilesExpanded(false)}>Collapse all</Button>
				</div>
			</div>
			<div ref={filesRef} className="space-y-2">{children}</div>
		</div>
	);
}
