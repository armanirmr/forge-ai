import { describe, expect, it } from "vitest";
import { resolveAnalyticsDateRange } from "./date-range";

const now = new Date("2026-10-08T12:00:00.000Z");

describe("analytics date range", () => {
	it("defaults to the last 7 days", () => {
		expect(resolveAnalyticsDateRange(undefined, undefined, undefined, now)).toMatchObject({ value: "7d", label: "Last 7 days", bucket: "day", invalidCustomRange: false });
	});

	it("keeps preset ranges and chart buckets", () => {
		expect(resolveAnalyticsDateRange("30d", undefined, undefined, now)).toMatchObject({ value: "30d", bucket: "day", invalidCustomRange: false });
		expect(resolveAnalyticsDateRange("90d", undefined, undefined, now)).toMatchObject({ value: "90d", bucket: "week" });
		expect(resolveAnalyticsDateRange("365d", undefined, undefined, now)).toMatchObject({ value: "365d", bucket: "month" });
	});

	it("uses inclusive UTC dates and an appropriate bucket for a custom range", () => {
		const range = resolveAnalyticsDateRange("custom", "2026-07-01", "2026-10-08", now);
		expect(range).toMatchObject({ value: "custom", bucket: "week", label: "Jul 1, 2026 – Oct 8, 2026", invalidCustomRange: false });
		expect(range.rangeStart.toISOString()).toBe("2026-07-01T00:00:00.000Z");
		expect(range.rangeEnd.toISOString()).toBe("2026-10-08T23:59:59.999Z");
	});

	it("falls back safely for reversed, invalid, future, or oversized custom ranges", () => {
		for (const [from, to] of [
			["2026-10-09", "2026-10-08"],
			["2026-02-30", "2026-03-01"],
			["2026-10-01", "2026-10-09"],
			["2010-01-01", "2026-10-08"],
		]) {
			expect(resolveAnalyticsDateRange("custom", from, to, now)).toMatchObject({ value: "90d", invalidCustomRange: true });
		}
	});
});
