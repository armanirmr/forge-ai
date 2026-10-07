import { describe, expect, it } from "vitest";
import type { StepResult } from "@/lib/verify/types";
import { pickFailures, pickMentionedPaths } from "./build-input";

const step = (
	name: string,
	exitCode: number | null,
	extra: Partial<StepResult> = {},
): StepResult => ({
	name,
	command: `npm ${name}`,
	exitCode,
	timedOut: false,
	durationMs: 1,
	output: "out",
	...extra,
});

describe("pickFailures", () => {
	it("returns failing and timed-out check steps but never install", () => {
		const out = pickFailures([
			step("install", 1),
			step("lint", 0),
			step("typecheck", 2),
			step("test", null, { timedOut: true }),
		]);
		expect(out.map((f) => f.step)).toEqual(["typecheck", "test"]);
	});

	it("caps the number of failures and keeps the tail of long output", () => {
		const long = "x".repeat(20_000) + "END";
		const out = pickFailures([
			step("a", 1, { output: long }),
			step("b", 1),
			step("c", 1),
		]);
		expect(out).toHaveLength(2);
		expect(out[0].output).toHaveLength(8000);
		expect(out[0].output.endsWith("END")).toBe(true);
	});
});

describe("pickMentionedPaths", () => {
	it("finds repository paths that appear in the output", () => {
		const out = pickMentionedPaths(
			["FAIL /work/src/a.ts:3"],
			["src/a.ts", "src/b.ts"],
			new Set(),
			5,
		);
		expect(out).toEqual(["src/a.ts"]);
	});

	it("skips excluded paths and respects the cap", () => {
		const out = pickMentionedPaths(
			["a.ts b.ts c.ts"],
			["a.ts", "b.ts", "c.ts"],
			new Set(["a.ts"]),
			1,
		);
		expect(out).toEqual(["b.ts"]);
	});
});
