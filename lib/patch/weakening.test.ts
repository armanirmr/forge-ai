import { describe, expect, it } from "vitest";
import { findTestWeakening } from "./weakening";

const edit = (path: string, search: string, replace: string) => ({
	path,
	search,
	replace,
});

describe("findTestWeakening", () => {
	it("ignores non-test files", () => {
		expect(
			findTestWeakening([edit("src/a.ts", 'it("x", () => {})', "")]),
		).toEqual([]);
	});

	it("flags skip, todo and only", () => {
		for (const call of ["it.skip(", "test.todo(", "describe.only(", "xit("]) {
			const out = findTestWeakening([
				edit("tests/a.test.ts", 'it("a"', `${call}"a"`),
			]);
			expect(out.some((p) => p.includes("skip/todo/only"))).toBe(true);
		}
	});

	it("does not flag a disabler that was already there", () => {
		const out = findTestWeakening([
			edit("tests/a.test.ts", 'it.skip("a", 1)', 'it.skip("a", 2)'),
		]);
		expect(out).toEqual([]);
	});

	it("flags a removed test case", () => {
		const out = findTestWeakening([
			edit(
				"tests/a.test.ts",
				'it("a", () => {})\nit("b", () => {})',
				'it("a", () => {})',
			),
		]);
		expect(out.some((p) => p.includes("removes a test case"))).toBe(true);
	});

	it("flags a removed assertion", () => {
		const out = findTestWeakening([
			edit(
				"tests/a.test.ts",
				"expect(a).toBe(1);\nexpect(b).toBe(2);",
				"expect(a).toBe(1);",
			),
		]);
		expect(out.some((p) => p.includes("removes an assertion"))).toBe(true);
	});

	it("accepts a rewrite that keeps every case and assertion", () => {
		const out = findTestWeakening([
			edit(
				"tests/a.test.ts",
				'expect(csv).toBe("r1,"e,mea",1")',
				"expect(csv).toBe('r1,\"e,mea\",1')",
			),
		]);
		expect(out).toEqual([]);
	});

	it("recognizes tests directories and .spec files", () => {
		expect(
			findTestWeakening([edit("tests/x.ts", "it(", "it.skip(")]),
		).not.toEqual([]);
		expect(
			findTestWeakening([edit("src/x.spec.ts", "it(", "it.skip(")]),
		).not.toEqual([]);
		expect(
			findTestWeakening([edit("src/latest.ts", "it(", "it.skip(")]),
		).toEqual([]);
	});
});
