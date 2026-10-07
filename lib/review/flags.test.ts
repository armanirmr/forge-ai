import { describe, expect, it } from "vitest";
import { findReviewFlags, type FlagInput } from "./flags";

const base: FlagInput = {
	tasks: [
		{
			id: "TASK-001",
			modifiesFiles: ["src/a.ts"],
			createsFiles: ["tests/a.test.ts"],
		},
	],
	edits: [{ taskId: "TASK-001", path: "src/a.ts", search: "x" }],
	repairEditPaths: [],
	skippedChecks: [],
};

describe("findReviewFlags", () => {
	it("returns nothing for a clean, planned change", () => {
		expect(findReviewFlags(base)).toEqual([]);
	});

	it("warns about a file the plan does not list", () => {
		const out = findReviewFlags({
			...base,
			edits: [
				...base.edits,
				{ taskId: "TASK-001", path: "src/other.ts", search: "x" },
			],
		});
		expect(out).toEqual([
			{
				level: "warn",
				message: "src/other.ts is edited but not listed in the plan",
			},
		]);
	});

	it("notes a new file", () => {
		const out = findReviewFlags({
			...base,
			edits: [{ taskId: "TASK-001", path: "tests/a.test.ts", search: "" }],
		});
		expect(out).toEqual([
			{ level: "info", message: "Creates new file tests/a.test.ts" },
		]);
	});

	it("warns when a repair edited a test file and notes other repairs", () => {
		const out = findReviewFlags({
			...base,
			repairEditPaths: ["tests/a.test.ts", "src/a.ts"],
		});
		expect(out[0].level).toBe("warn");
		expect(out[0].message).toContain("test file tests/a.test.ts");
		expect(out[1]).toEqual({
			level: "info",
			message: "A repair edited src/a.ts",
		});
	});

	it("lists skipped checks once per check", () => {
		const out = findReviewFlags({
			...base,
			skippedChecks: [
				{ name: "typecheck", reason: 'No "typecheck" script in package.json' },
				{ name: "lint", reason: 'No "lint" script in package.json' },
			],
		});
		expect(out.map((f) => f.message)).toEqual([
			'typecheck was not run: No "typecheck" script in package.json',
			'lint was not run: No "lint" script in package.json',
		]);
	});

	it("lists warnings before notes", () => {
		const out = findReviewFlags({
			...base,
			edits: [{ taskId: "TASK-001", path: "src/other.ts", search: "" }],
		});
		expect(out.map((f) => f.level)).toEqual(["warn", "info"]);
	});
});
