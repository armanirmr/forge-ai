import type { AnalyticsBucket } from "./series";

export const analyticsRanges = [
	{ value: "30d", label: "Last 30 days", days: 30, bucket: "day" },
	{ value: "90d", label: "Last 90 days", days: 90, bucket: "week" },
	{ value: "365d", label: "12 months", days: 365, bucket: "month" },
] as const;

export type AnalyticsRangeValue = (typeof analyticsRanges)[number]["value"] | "custom";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_CUSTOM_RANGE_DAYS = 3650;

function parseCalendarDate(value: string | undefined): Date | null {
	if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
	const date = new Date(`${value}T00:00:00.000Z`);
	return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function bucketForDays(days: number): AnalyticsBucket {
	if (days <= 60) return "day";
	if (days <= 180) return "week";
	return "month";
}

function calendarLabel(start: Date, end: Date): string {
	const format = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
	return `${format.format(start)} – ${format.format(end)}`;
}

export function resolveAnalyticsDateRange(
	rangeValue: string | undefined,
	fromValue: string | undefined,
	toValue: string | undefined,
	now = new Date(),
) {
	const selectedTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
	const preset = analyticsRanges.find((option) => option.value === rangeValue);
	if (preset) {
		const rangeEnd = now;
		const rangeStart = new Date(rangeEnd.getTime() - preset.days * DAY_MS);
		return {
			value: preset.value,
			label: preset.label,
			bucket: preset.bucket,
			rangeStart,
			rangeEnd,
			from: rangeStart.toISOString().slice(0, 10),
			to: selectedTo.toISOString().slice(0, 10),
			invalidCustomRange: false,
		};
	}

	if (rangeValue === "custom") {
		const customStart = parseCalendarDate(fromValue);
		const customEnd = parseCalendarDate(toValue);
		if (customStart && customEnd && customStart <= customEnd && customEnd <= selectedTo) {
			const days = Math.floor((customEnd.getTime() - customStart.getTime()) / DAY_MS) + 1;
			if (days <= MAX_CUSTOM_RANGE_DAYS) {
				return {
					value: "custom" as const,
					label: calendarLabel(customStart, new Date(customEnd.getTime() + DAY_MS - 1)),
					bucket: bucketForDays(days),
					rangeStart: customStart,
					rangeEnd: new Date(customEnd.getTime() + DAY_MS - 1),
					from: fromValue!,
					to: toValue!,
					invalidCustomRange: false,
				};
			}
		}
	}

	const fallback = analyticsRanges[1];
	const rangeEnd = now;
	const rangeStart = new Date(rangeEnd.getTime() - fallback.days * DAY_MS);
	return {
		value: fallback.value,
		label: fallback.label,
		bucket: fallback.bucket,
		rangeStart,
		rangeEnd,
		from: rangeStart.toISOString().slice(0, 10),
		to: selectedTo.toISOString().slice(0, 10),
		invalidCustomRange: rangeValue === "custom",
	};
}
