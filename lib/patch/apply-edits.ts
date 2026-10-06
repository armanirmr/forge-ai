export type FileEdit = { path: string; search: string; replace: string };
export type AppliedFile = {
	path: string;
	before: string | null;
	after: string;
};

export type ApplyResult =
	| { ok: true; files: AppliedFile[] }
	| { ok: false; problems: string[] };

const preview = (s: string) =>
	JSON.stringify(s.length > 80 ? `${s.slice(0, 80)}…` : s);

/** Counts occurrences, including overlapping ones, so ambiguous anchors are caught. */
function countOccurrences(haystack: string, needle: string): number {
	let count = 0;
	let from = 0;
	for (;;) {
		const i = haystack.indexOf(needle, from);
		if (i === -1) return count;
		count += 1;
		from = i + 1;
	}
}

/**
 * Applies search/replace edits in order to an in-memory copy of the files.
 * - Non-empty search: must match exactly once in the file as it is at that point.
 * - Empty search: creates a new file; the path must not already exist.
 * Never touches disk or the database.
 */
export function applyEdits(
	files: Record<string, string>,
	edits: FileEdit[],
): ApplyResult {
	const original = new Map(Object.entries(files));
	const current = new Map(original);
	const touched: string[] = [];
	const problems: string[] = [];

	edits.forEach((e, i) => {
		const label = `edit ${i + 1} (${e.path})`;

		if (e.search === e.replace) {
			problems.push(`${label}: search and replace are identical`);
			return;
		}

		if (e.search === "") {
			if (current.has(e.path)) {
				problems.push(
					`${label}: creates a file that already exists; use a non-empty search to edit it`,
				);
				return;
			}
			current.set(e.path, e.replace);
		} else {
			const content = current.get(e.path);
			if (content === undefined) {
				problems.push(
					`${label}: file does not exist; to create a file use an empty search`,
				);
				return;
			}
			const count = countOccurrences(content, e.search);
			if (count !== 1) {
				problems.push(
					`${label}: search text matched ${count} times (must match exactly once; copy it verbatim from the file as it is after earlier edits): ${preview(e.search)}`,
				);
				return;
			}
			const at = content.indexOf(e.search);
			// Slice instead of String.replace so "$&" style sequences in code stay literal.
			current.set(
				e.path,
				content.slice(0, at) + e.replace + content.slice(at + e.search.length),
			);
		}

		if (!touched.includes(e.path)) touched.push(e.path);
	});

	if (problems.length > 0) return { ok: false, problems };

	return {
		ok: true,
		files: touched.map((path) => ({
			path,
			before: original.get(path) ?? null,
			after: current.get(path) as string,
		})),
	};
}
