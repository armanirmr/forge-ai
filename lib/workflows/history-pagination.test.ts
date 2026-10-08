import { describe, expect, it } from "vitest";
import {
	escapeWorkflowHistorySearch,
	normalizeWorkflowHistorySearch,
	resolveWorkflowHistoryPage,
	workflowHistoryPageCount,
} from "./history-pagination";

describe("workflow history filters", () => {
	it("trims and bounds requirement searches and treats LIKE wildcards literally", () => {
		expect(normalizeWorkflowHistorySearch("  export  ")).toBe("export");
		expect(normalizeWorkflowHistorySearch("x".repeat(120))).toHaveLength(100);
		expect(escapeWorkflowHistorySearch("100%_ready\\now")).toBe("100\\%\\_ready\\\\now");
	});

	it("keeps pagination within the available result pages", () => {
		expect(workflowHistoryPageCount(41, 20)).toBe(3);
		expect(workflowHistoryPageCount(0, 20)).toBe(1);
		expect(resolveWorkflowHistoryPage("3", 41, 20)).toBe(3);
		expect(resolveWorkflowHistoryPage("99", 41, 20)).toBe(3);
		expect(resolveWorkflowHistoryPage("-1", 41, 20)).toBe(1);
		expect(resolveWorkflowHistoryPage("2.5", 41, 20)).toBe(1);
	});
});
