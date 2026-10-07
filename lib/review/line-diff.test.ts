import { describe, expect, it } from "vitest";
import { buildHunks, limitHunks } from "./line-diff";

const text = (...lines: string[]) => lines.join("\n") + "\n";
const show = (lines: { type: string; text: string }[]) =>
	lines.map((l) => `${l.type}${l.text}`);

describe("buildHunks", () => {
	it("returns no hunks when nothing changed", () => {
		expect(buildHunks(text("a", "b"), text("a", "b"))).toEqual([]);
	});

	it("shows a changed line with its context and line numbers", () => {
		const before = text("1", "2", "3", "4", "5", "6", "7", "8", "9");
		const after = text("1", "2", "3", "4", "X", "6", "7", "8", "9");
		const hunks = buildHunks(before, after, 2);
		expect(hunks).toHaveLength(1);
		expect(hunks[0].oldStart).toBe(3);
		expect(hunks[0].newStart).toBe(3);
		expect(show(hunks[0].lines)).toEqual([" 3", " 4", "-5", "+X", " 6", " 7"]);
	});

	it("handles a change at the end of the file without a trailing blank line", () => {
		const hunks = buildHunks(text("a", "b"), text("a", "b", "c"));
		expect(show(hunks[0].lines)).toEqual([" a", " b", "+c"]);
	});

	it("treats a missing original as an all-added file", () => {
		expect(buildHunks(null, text("a", "b"))).toEqual([
			{
				oldStart: 0,
				newStart: 1,
				lines: [
					{ type: "+", text: "a" },
					{ type: "+", text: "b" },
				],
			},
		]);
	});

	it("keeps distant changes in separate hunks", () => {
		const nums = Array.from({ length: 20 }, (_, i) => String(i + 1));
		const before = text(...nums);
		const after = text(
			...nums.map((n) => (n === "2" || n === "18" ? `${n}x` : n)),
		);
		const hunks = buildHunks(before, after, 1);
		expect(hunks).toHaveLength(2);
		expect(hunks[1].lines[0]).toEqual({ type: " ", text: "17" });
	});
});

describe("limitHunks", () => {
	const hunk = (n: number) => ({
		oldStart: 1,
		newStart: 1,
		lines: Array.from({ length: 3 }, (_, i) => ({
			type: "+" as const,
			text: `${n}-${i}`,
		})),
	});

	it("cuts the last hunk when the line budget runs out", () => {
		const out = limitHunks([hunk(1), hunk(2), hunk(3)], 5);
		expect(out.truncated).toBe(true);
		expect(out.hunks).toHaveLength(2);
		expect(out.hunks[1].lines).toHaveLength(2);
	});

	it("returns everything when it fits", () => {
		const out = limitHunks([hunk(1), hunk(2)], 100);
		expect(out.truncated).toBe(false);
		expect(out.hunks).toHaveLength(2);
	});
});
