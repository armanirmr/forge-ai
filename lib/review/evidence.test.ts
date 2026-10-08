import { describe, expect, it } from "vitest";
import { evidenceInLines } from "./evidence";

describe("evidenceInLines", () => {
	it("finds a quote inside a line, ignoring whitespace differences", () => {
		expect(evidenceInLines("if (a && b)", ["  if (a   &&  b) {", "}"])).toBe(
			true,
		);
	});

	it("rejects absent or empty evidence", () => {
		expect(evidenceInLines("nope", ["const a = 1;"])).toBe(false);
		expect(evidenceInLines("   ", ["const a = 1;"])).toBe(false);
	});
});
