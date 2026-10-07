import { describe, expect, it } from "vitest";
import { findMissingCoverage } from "./coverage";

const tasks = [
	{ id: "TASK-001", modifiesFiles: ["a.ts"], createsFiles: [] },
	{ id: "TASK-002", modifiesFiles: ["b.ts"], createsFiles: ["c.ts"] },
];

describe("findMissingCoverage", () => {
	it("returns nothing when every planned file has an edit", () => {
		const edits = [
			{ taskId: "TASK-001", path: "a.ts", search: "x" },
			{ taskId: "TASK-002", path: "b.ts", search: "y" },
			{ taskId: "TASK-002", path: "c.ts", search: "" },
		];
		expect(findMissingCoverage(tasks, edits)).toEqual([]);
	});

	it("names every task and file that has no edit", () => {
		const edits = [{ taskId: "TASK-001", path: "a.ts", search: "x" }];
		const problems = findMissingCoverage(tasks, edits);
		expect(problems).toHaveLength(2);
		expect(problems[0]).toContain("b.ts (TASK-002)");
		expect(problems[1]).toContain("c.ts (TASK-002)");
	});

	it("reports everything when there are no edits at all", () => {
		expect(findMissingCoverage(tasks, [])).toHaveLength(3);
	});

	it("does not accept an edit attributed to a different task", () => {
		const edits = [{ taskId: "TASK-002", path: "a.ts", search: "x" }];
		expect(findMissingCoverage(tasks, edits)[0]).toContain("a.ts (TASK-001)");
	});

	it("requires a new-file edit (empty search) for created files", () => {
		const edits = [
			{ taskId: "TASK-001", path: "a.ts", search: "x" },
			{ taskId: "TASK-002", path: "b.ts", search: "y" },
			{ taskId: "TASK-002", path: "c.ts", search: "not empty" },
		];
		expect(findMissingCoverage(tasks, edits)[0]).toContain("c.ts");
	});

	it("handles a path listed twice in one task", () => {
		const dup = [
			{ id: "TASK-001", modifiesFiles: ["a.ts", "a.ts"], createsFiles: [] },
		];
		expect(findMissingCoverage(dup, [])).toHaveLength(1);
	});
});
