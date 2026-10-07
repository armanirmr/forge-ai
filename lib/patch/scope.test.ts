import { describe, expect, it } from "vitest";
import { findScopeProblems } from "./scope";

const tasks = [
	{ id: "TASK-001", modifiesFiles: ["a.ts"], createsFiles: ["a.test.ts"] },
];

describe("findScopeProblems", () => {
	it("accepts edits inside the task's files", () => {
		expect(
			findScopeProblems(tasks, [
				{ taskId: "TASK-001", path: "a.ts", search: "x" },
			]),
		).toEqual([]);
	});

	it("rejects an unknown task", () => {
		expect(
			findScopeProblems(tasks, [
				{ taskId: "TASK-009", path: "a.ts", search: "x" },
			])[0],
		).toContain("unknown task");
	});

	it("rejects a path outside the task", () => {
		expect(
			findScopeProblems(tasks, [
				{ taskId: "TASK-001", path: "b.ts", search: "x" },
			])[0],
		).toContain("outside the scope");
	});

	it("allows an empty search (new file) only for created files", () => {
		expect(
			findScopeProblems(tasks, [
				{ taskId: "TASK-001", path: "a.ts", search: "" },
			]),
		).toHaveLength(1);
		expect(
			findScopeProblems(tasks, [
				{ taskId: "TASK-001", path: "a.test.ts", search: "" },
			]),
		).toEqual([]);
	});

	it("allows modifying a file the task creates", () => {
		expect(
			findScopeProblems(tasks, [
				{ taskId: "TASK-001", path: "a.test.ts", search: "x" },
			]),
		).toEqual([]);
	});
});
