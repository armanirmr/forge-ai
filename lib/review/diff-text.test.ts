import { describe, expect, it } from "vitest";
import { buildReviewDiff } from "./diff-text";

const hunk = (n: number) => ({
	oldStart: 1,
	newStart: 1,
	lines: Array.from({ length: n }, () => ({
		type: "+" as const,
		text: "0123456789",
	})),
});
const file = (path: string, n: number) => ({
	path,
	isNew: false,
	hunks: [hunk(n)],
});

describe("buildReviewDiff", () => {
	it("keeps every file when the budget is large enough", () => {
		const out = buildReviewDiff([file("a.ts", 2), file("b.ts", 2)], 10_000);
		expect(out.files.map((f) => f.path)).toEqual(["a.ts", "b.ts"]);
		expect(out.omittedPaths).toEqual([]);
		expect(out.files.every((f) => !f.truncated)).toBe(true);
	});

	it("cuts a file that does not fit and marks it truncated", () => {
		const out = buildReviewDiff([file("a.ts", 3)], 30);
		expect(out.files[0].truncated).toBe(true);
		expect(out.files[0].hunks[0].lines).toHaveLength(2);
	});

	it("names files that no longer fit", () => {
		const out = buildReviewDiff([file("a.ts", 2), file("b.ts", 2)], 26);
		expect(out.files.map((f) => f.path)).toEqual(["a.ts"]);
		expect(out.omittedPaths).toEqual(["b.ts"]);
	});
});
