import { describe, expect, it } from "vitest";
import { buildRequirementTrace, requirementTraceBlockers } from "./traceability";

describe("review requirement traceability", () => {
	it("maps changed files through their plan task to requirement descriptions", () => {
		const trace = buildRequirementTrace(
			[
				{ taskId: "TASK-001", path: "src/import.ts" },
				{ taskId: "TASK-001", path: "src/import.test.ts" },
				{ taskId: "TASK-002", path: "src/import.ts" },
			],
			[
				{ id: "TASK-001", title: "Preserve existing records", requirementIds: ["REQ-001"] },
				{ id: "TASK-002", title: "Report skipped duplicates", requirementIds: ["REQ-002"] },
				{ id: "TASK-003", title: "Unchanged task", requirementIds: ["REQ-001"] },
			],
			[
				{ id: "REQ-001", description: "Existing records remain unchanged." },
				{ id: "REQ-002", description: "Skipped duplicate rows are reported." },
			],
		);

		expect(trace).toEqual({
			requirements: [
				{
					id: "REQ-001",
					description: "Existing records remain unchanged.",
					tasks: [{ id: "TASK-001", title: "Preserve existing records", paths: ["src/import.test.ts", "src/import.ts"] }],
				},
				{
					id: "REQ-002",
					description: "Skipped duplicate rows are reported.",
					tasks: [{ id: "TASK-002", title: "Report skipped duplicates", paths: ["src/import.ts"] }],
				},
			],
			unmappedTasks: [],
		});
	});

	it("surfaces unknown task and requirement references instead of guessing", () => {
		const trace = buildRequirementTrace(
			[
				{ taskId: "TASK-999", path: "src/new.ts" },
				{ taskId: "TASK-001", path: "src/known.ts" },
			],
			[{ id: "TASK-001", title: "Known task", requirementIds: ["REQ-999"] }],
			[],
		);

		expect(trace.requirements).toEqual([
			{ id: "REQ-999", description: null, tasks: [{ id: "TASK-001", title: "Known task", paths: ["src/known.ts"] }] },
		]);
		expect(trace.unmappedTasks).toEqual([{ taskId: "TASK-999", paths: ["src/new.ts"] }]);
		expect(requirementTraceBlockers(trace, true)).toEqual([
			"Edits reference unknown plan task TASK-999 (src/new.ts)",
			"Plan task references unknown requirement REQ-999",
		]);
	});

	it("blocks approval when requirement links cannot be checked against analysis", () => {
		const trace = buildRequirementTrace(
			[{ taskId: "TASK-001", path: "src/known.ts" }],
			[{ id: "TASK-001", title: "Known task", requirementIds: ["REQ-001"] }],
			[],
		);

		expect(requirementTraceBlockers(trace, false)).toEqual([
			"Requirement analysis is missing or invalid; mapped requirement IDs cannot be verified",
		]);
	});
});
