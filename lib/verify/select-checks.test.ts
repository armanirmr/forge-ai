import { describe, expect, it } from "vitest";
import { selectChecks } from "./select-checks";

const pkg = (scripts?: Record<string, unknown>) =>
	JSON.stringify(scripts ? { scripts } : {});

describe("selectChecks", () => {
	it("errors without a package.json", () => {
		expect(selectChecks(undefined).error).toMatch(/no package\.json/);
	});

	it("errors on invalid JSON", () => {
		expect(selectChecks("{nope").error).toMatch(/not valid JSON/);
	});

	it("runs only the scripts that exist and reports the rest as skipped", () => {
		const r = selectChecks(pkg({ test: "vitest run" }));
		expect(r.checks.map((c) => c.name)).toEqual(["test"]);
		expect(r.skipped.map((s) => s.name)).toEqual(["typecheck", "lint"]);
		expect(r.checks[0].command).toEqual(["npm", "test"]);
	});

	it("orders typecheck, lint, test", () => {
		const r = selectChecks(pkg({ test: "t", lint: "l", typecheck: "c" }));
		expect(r.checks.map((c) => c.name)).toEqual(["typecheck", "lint", "test"]);
		expect(r.checks[0].command).toEqual(["npm", "run", "typecheck"]);
	});

	it("treats npm's placeholder test script as no tests", () => {
		const r = selectChecks(
			pkg({ test: 'echo "Error: no test specified" && exit 1' }),
		);
		expect(r.checks).toEqual([]);
		expect(r.skipped.find((s) => s.name === "test")?.reason).toMatch(
			/placeholder/,
		);
	});

	it("skips empty or non-string scripts", () => {
		const r = selectChecks(pkg({ test: "", lint: 5 }));
		expect(r.checks).toEqual([]);
	});

	it("handles a package.json with no scripts field", () => {
		const r = selectChecks(pkg());
		expect(r.checks).toEqual([]);
		expect(r.skipped).toHaveLength(3);
		expect(r.error).toBeNull();
	});
});
