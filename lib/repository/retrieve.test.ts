import { describe, it, expect, vi } from "vitest";

// retrieve.ts imports the db module, which requires DATABASE_URL at import time.
vi.mock("@/lib/db", () => ({ db: {} }));

import { extractKeywords } from "./retrieve";

describe("extractKeywords", () => {
	it("extracts and lightly stems meaningful words", () => {
		expect(
			extractKeywords("Add CSV export to the analytics dashboard."),
		).toEqual(["csv", "export", "analytic", "dashboard"]);
	});

	it("drops stopwords and short words", () => {
		expect(extractKeywords("Reports should respect the date filters")).toEqual([
			"report",
			"respect",
			"date",
			"filter",
		]);
	});

	it("dedupes and caps the count", () => {
		expect(extractKeywords("export exports EXPORT")).toEqual(["export"]);
		expect(extractKeywords("alpha beta gamma delta", 2)).toEqual([
			"alpha",
			"beta",
		]);
	});

	it("returns nothing for empty input", () => {
		expect(extractKeywords("")).toEqual([]);
	});
});
