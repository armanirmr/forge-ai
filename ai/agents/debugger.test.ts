import { describe, expect, it } from "vitest";
import type { RepairInput } from "@/ai/schemas/repair";
import { debuggerAgent } from "./debugger";

const input = {
	plan: {
		tasks: [
			{
				id: "TASK-001",
				modifiesFiles: ["src/a.ts"],
				createsFiles: ["tests/a.test.ts"],
			},
		],
	},
	editableFiles: [
		{ path: "src/a.ts", content: "export const a = 1;\n" },
		{
			path: "tests/a.test.ts",
			content: 'it("a", () => {\n  expect(a).toBe(1);\n});\n',
		},
	],
} as unknown as RepairInput;

const fix = {
	rootCause: "x",
	summary: "y",
	cannotFixReason: null,
	notes: [],
	edits: [
		{ taskId: "TASK-001", path: "src/a.ts", search: "= 1", replace: "= 2" },
	],
};

const check = (output: unknown) =>
	debuggerAgent.semanticChecks!(input, output as never);

describe("debuggerAgent.semanticChecks", () => {
	it("accepts a valid fix", () => {
		expect(check(fix)).toEqual([]);
	});

	it("rejects no edits without a reason", () => {
		expect(check({ ...fix, edits: [] })[0]).toContain("No edits were returned");
	});

	it("accepts cannotFixReason with no edits", () => {
		expect(
			check({
				...fix,
				cannotFixReason: "needs a file outside the plan",
				edits: [],
			}),
		).toEqual([]);
	});

	it("rejects cannotFixReason together with edits", () => {
		expect(check({ ...fix, cannotFixReason: "no" })[0]).toContain(
			"edits must be empty",
		);
	});

	it("rejects edits outside the plan's files", () => {
		const bad = {
			...fix,
			edits: [
				{ taskId: "TASK-001", path: "src/other.ts", search: "x", replace: "y" },
			],
		};
		expect(check(bad).some((p) => p.includes("outside the scope"))).toBe(true);
	});

	it("rejects edits that do not apply", () => {
		const bad = {
			...fix,
			edits: [
				{ taskId: "TASK-001", path: "src/a.ts", search: "nope", replace: "y" },
			],
		};
		expect(check(bad).some((p) => p.includes("matched 0 times"))).toBe(true);
	});

	it("rejects weakening a test", () => {
		const bad = {
			...fix,
			edits: [
				{
					taskId: "TASK-001",
					path: "tests/a.test.ts",
					search: 'it("a"',
					replace: 'it.skip("a"',
				},
			],
		};
		expect(check(bad).some((p) => p.includes("skip/todo/only"))).toBe(true);
	});

	it("rejects secrets in a replacement", () => {
		const bad = {
			...fix,
			edits: [
				{
					taskId: "TASK-001",
					path: "src/a.ts",
					search: "= 1",
					replace: `= "ghp_${"a".repeat(36)}"`,
				},
			],
		};
		expect(check(bad).some((p) => p.includes("secret"))).toBe(true);
	});
});
