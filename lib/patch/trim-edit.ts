/**
 * For display only: drops the lines that `search` and `replace` share at the start and end,
 * so the viewer shows what actually changes. The stored edit is never modified.
 */
export function trimEditForDisplay(
	search: string,
	replace: string,
): { removed: string[]; added: string[] } {
	if (search === "") return { removed: [], added: replace.split("\n") };

	const a = search.split("\n");
	const b = replace.split("\n");

	let start = 0;
	while (start < a.length && start < b.length && a[start] === b[start])
		start += 1;

	let endA = a.length;
	let endB = b.length;
	while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
		endA -= 1;
		endB -= 1;
	}
	return { removed: a.slice(start, endA), added: b.slice(start, endB) };
}
