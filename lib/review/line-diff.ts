export type DiffLine = { type: " " | "+" | "-"; text: string };
export type Hunk = { oldStart: number; newStart: number; lines: DiffLine[] };

/** Above this many table cells, a changed region is shown as a plain replacement. */
const MAX_CELLS = 4_000_000;

function lcsDiff(a: string[], b: string[]): DiffLine[] {
	const n = a.length;
	const m = b.length;
	const w = m + 1;
	const t = new Uint32Array((n + 1) * w);
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			t[i * w + j] =
				a[i] === b[j]
					? t[(i + 1) * w + j + 1] + 1
					: Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
		}
	}
	const out: DiffLine[] = [];
	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (a[i] === b[j]) {
			out.push({ type: " ", text: a[i] });
			i++;
			j++;
		} else if (t[(i + 1) * w + j] >= t[i * w + j + 1]) {
			out.push({ type: "-", text: a[i] });
			i++;
		} else {
			out.push({ type: "+", text: b[j] });
			j++;
		}
	}
	while (i < n) out.push({ type: "-", text: a[i++] });
	while (j < m) out.push({ type: "+", text: b[j++] });
	return out;
}

/** Line-level diff of two texts, including unchanged lines. */
export function diffLines(before: string, after: string): DiffLine[] {
	const a = before.split("\n");
	const b = after.split("\n");
	let start = 0;
	while (start < a.length && start < b.length && a[start] === b[start]) start++;
	let endA = a.length;
	let endB = b.length;
	while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
		endA--;
		endB--;
	}
	const head = a.slice(0, start).map((text): DiffLine => ({ type: " ", text }));
	const tail = a.slice(endA).map((text): DiffLine => ({ type: " ", text }));
	const midA = a.slice(start, endA);
	const midB = b.slice(start, endB);
	const mid =
		midA.length * midB.length > MAX_CELLS
			? [
					...midA.map((text): DiffLine => ({ type: "-", text })),
					...midB.map((text): DiffLine => ({ type: "+", text })),
				]
			: lcsDiff(midA, midB);
	return [...head, ...mid, ...tail];
}

/** Groups changed lines with surrounding context into hunks. */
export function toHunks(lines: DiffLine[], context: number): Hunk[] {
	const ranges: [number, number][] = [];
	lines.forEach((line, idx) => {
		if (line.type === " ") return;
		const s = Math.max(0, idx - context);
		const e = Math.min(lines.length - 1, idx + context);
		const last = ranges[ranges.length - 1];
		if (last && s <= last[1] + 1) last[1] = Math.max(last[1], e);
		else ranges.push([s, e]);
	});
	if (ranges.length === 0) return [];

	const oldAt: number[] = [];
	const newAt: number[] = [];
	let o = 1;
	let n = 1;
	for (const line of lines) {
		oldAt.push(o);
		newAt.push(n);
		if (line.type !== "+") o++;
		if (line.type !== "-") n++;
	}
	return ranges.map(([s, e]) => ({
		oldStart: oldAt[s],
		newStart: newAt[s],
		lines: lines.slice(s, e + 1),
	}));
}

/** `before` is null for a file that did not exist before the change. */
export function buildHunks(
	before: string | null,
	after: string,
	context = 3,
): Hunk[] {
	if (before === null) {
		const lines = after.split("\n");
		if (lines.at(-1) === "") lines.pop();
		if (lines.length === 0) return [];
		return [
			{
				oldStart: 0,
				newStart: 1,
				lines: lines.map((text): DiffLine => ({ type: "+", text })),
			},
		];
	}
	const lines = diffLines(before, after);
	const last = lines.at(-1);
	if (last && last.type === " " && last.text === "") lines.pop();
	return toHunks(lines, context);
}

/** Caps how many lines are rendered for one file. */
export function limitHunks(
	hunks: Hunk[],
	maxLines: number,
): { hunks: Hunk[]; truncated: boolean } {
	const out: Hunk[] = [];
	let used = 0;
	for (const h of hunks) {
		const room = maxLines - used;
		if (room <= 0) return { hunks: out, truncated: true };
		if (h.lines.length > room) {
			out.push({ ...h, lines: h.lines.slice(0, room) });
			return { hunks: out, truncated: true };
		}
		out.push(h);
		used += h.lines.length;
	}
	return { hunks: out, truncated: false };
}
