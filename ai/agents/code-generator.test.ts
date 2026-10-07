import { describe, it, expect } from "vitest";
import { codeGenerator } from "./code-generator";
import type {
	CodeChange,
	CodeGenerationInput,
} from "@/ai/schemas/code-generation";

const input: CodeGenerationInput = {
	requirement: "Add CSV export to the analytics dashboard",
	repository: {
		owner: "o",
		name: "r",
		defaultBranch: "main",
		language: "typescript",
	},
	fileTree: ["src/api/reports.ts", "tests/reports.test.ts"],
	analysis: {
		summary: "s",
		functionalRequirements: [
			{ id: "REQ-001", description: "d", priority: "high", basis: "explicit" },
		],
		nonFunctionalRequirements: [],
		constraints: [],
		assumptions: [],
		risks: [],
		acceptanceCriteria: ["a"],
		affectedFiles: [],
		openQuestions: [],
	},
	plan: {
		approach: "a",
		architectureNotes: [],
		risks: [],
		openQuestions: [],
		tasks: [
			{
				id: "TASK-001",
				title: "t",
				description: "d",
				requirementIds: ["REQ-001"],
				dependencies: [],
				modifiesFiles: ["src/api/reports.ts"],
				createsFiles: ["src/reports/csv.ts"],
				acceptanceCriteria: ["c"],
				risk: "low",
				estimatedComplexity: "small",
			},
		],
	},
	editableFiles: [
		{
			path: "src/api/reports.ts",
			content: "export function a() {}\nexport function b() {}\n",
		},
	],
	referenceFiles: [],
};

const check = (edits: CodeChange["edits"]) =>
	codeGenerator.semanticChecks!(input, { summary: "s", edits, notes: [] });

describe("codeGenerator.semanticChecks", () => {
	it("accepts in-scope edits that apply cleanly", () => {
		expect(
			check([
				{
					taskId: "TASK-001",
					path: "src/reports/csv.ts",
					search: "",
					replace: "export const x = 1;\n",
				},
				{
					taskId: "TASK-001",
					path: "src/api/reports.ts",
					search: "export function b() {}",
					replace: "export function b() { return 1; }",
				},
			]),
		).toEqual([]);
	});

	it("rejects unknown task ids", () => {
		const problems = check([
			{
				taskId: "TASK-009",
				path: "src/reports/csv.ts",
				search: "",
				replace: "x",
			},
		]);
		expect(problems.join(";")).toContain("unknown task TASK-009");
	});

	it("rejects edits outside the task's file scope", () => {
		const problems = check([
			{
				taskId: "TASK-001",
				path: "tests/reports.test.ts",
				search: "x",
				replace: "y",
			},
		]);
		expect(problems.some((p) => p.includes("outside the scope"))).toBe(true);
	});

	it("rejects a search that does not match the file", () => {
		const problems = check([
			{
				taskId: "TASK-001",
				path: "src/api/reports.ts",
				search: "nope",
				replace: "x",
			},
		]);
		expect(problems.join(";")).toContain("matched 0 times");
	});

	it("rejects output containing something that looks like a secret", () => {
		const token = "ghp_" + "a".repeat(36);
		const problems = check([
			{
				taskId: "TASK-001",
				path: "src/reports/csv.ts",
				search: "",
				replace: `const t = "${token}";`,
			},
		]);
		expect(problems.join(";")).toContain("secret");
	});
});
