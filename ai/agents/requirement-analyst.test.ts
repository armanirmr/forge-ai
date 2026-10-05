import { describe, it, expect } from "vitest";
import { requirementAnalyst } from "./requirement-analyst";
import type { RequirementAnalysisInput } from "@/ai/schemas/requirement-analysis";

const input: RequirementAnalysisInput = {
	requirement: "Add CSV export to the analytics dashboard",
	repository: {
		owner: "o",
		name: "r",
		defaultBranch: "main",
		language: "typescript",
	},
	fileTree: ["src/dashboard/dashboard.ts"],
	fileTreeTotal: 1,
	snippets: [],
};

const valid = {
	summary: "s",
	functionalRequirements: [
		{ id: "REQ-001", description: "d", priority: "high", basis: "explicit" },
	],
	nonFunctionalRequirements: [],
	constraints: [],
	assumptions: [],
	risks: [],
	acceptanceCriteria: ["a"],
	affectedFiles: [{ path: "src/dashboard/dashboard.ts", reason: "r" }],
	openQuestions: [],
};

describe("requirementAnalyst.semanticChecks", () => {
	it("accepts files that exist in the tree", () => {
		expect(requirementAnalyst.semanticChecks!(input, valid as never)).toEqual(
			[],
		);
	});

	it("rejects invented file paths", () => {
		const bad = {
			...valid,
			affectedFiles: [{ path: "src/made/up.ts", reason: "r" }],
		};
		expect(
			requirementAnalyst.semanticChecks!(input, bad as never)[0],
		).toContain("src/made/up.ts");
	});

	it("rejects duplicate requirement ids", () => {
		const dup = {
			...valid,
			functionalRequirements: [
				valid.functionalRequirements[0],
				valid.functionalRequirements[0],
			],
		};
		expect(requirementAnalyst.semanticChecks!(input, dup as never)).toContain(
			"Duplicate functional requirement ids",
		);
	});
});
