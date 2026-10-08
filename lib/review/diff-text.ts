import type { Hunk } from "./line-diff";

/** Approximate size of one rendered line: its text plus marker and newline. */
const lineCost = (text: string) => text.length + 3;

export type ReviewDiffFile = {
	path: string;
	isNew: boolean;
	hunks: Hunk[];
	truncated: boolean;
};

function limitHunksByChars(
	hunks: Hunk[],
	maxChars: number,
): { hunks: Hunk[]; truncated: boolean; used: number } {
	const out: Hunk[] = [];
	let used = 0;
	for (const h of hunks) {
		const lines: Hunk["lines"] = [];
		for (const line of h.lines) {
			const cost = lineCost(line.text);
			if (used + cost > maxChars) {
				if (lines.length > 0) out.push({ ...h, lines });
				return { hunks: out, truncated: true, used };
			}
			lines.push(line);
			used += cost;
		}
		out.push({ ...h, lines });
	}
	return { hunks: out, truncated: false, used };
}

/** Picks as much of the diff as fits the budget and names the files that were left out. */
export function buildReviewDiff(
	files: { path: string; isNew: boolean; hunks: Hunk[] }[],
	maxChars: number,
): { files: ReviewDiffFile[]; omittedPaths: string[] } {
	const out: ReviewDiffFile[] = [];
	const omitted: string[] = [];
	let remaining = maxChars;
	for (const f of files) {
		if (f.hunks.length === 0) continue;
		if (remaining <= 0) {
			omitted.push(f.path);
			continue;
		}
		const limited = limitHunksByChars(f.hunks, remaining);
		remaining -= limited.used;
		if (limited.hunks.length === 0) {
			omitted.push(f.path);
			continue;
		}
		out.push({
			path: f.path,
			isNew: f.isNew,
			hunks: limited.hunks,
			truncated: limited.truncated,
		});
	}
	return { files: out, omittedPaths: omitted };
}
