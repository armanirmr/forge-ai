import { describe, it, expect } from "vitest";
import { applyEdits } from "./apply-edits";

const files = { "a.ts": "one\ntwo\nthree\n" };

describe("applyEdits", () => {
	it("replaces a unique match", () => {
		const r = applyEdits(files, [
			{ path: "a.ts", search: "two", replace: "2" },
		]);
		expect(r).toEqual({
			ok: true,
			files: [
				{ path: "a.ts", before: "one\ntwo\nthree\n", after: "one\n2\nthree\n" },
			],
		});
	});

	it("rejects a search that does not match", () => {
		const r = applyEdits(files, [
			{ path: "a.ts", search: "four", replace: "4" },
		]);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.problems[0]).toContain("matched 0 times");
	});

	it("rejects an ambiguous search", () => {
		const r = applyEdits({ "a.ts": "x\nx\n" }, [
			{ path: "a.ts", search: "x", replace: "y" },
		]);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.problems[0]).toContain("matched 2 times");
	});

	it("applies edits sequentially against the updated content", () => {
		const r = applyEdits(files, [
			{ path: "a.ts", search: "two", replace: "2" },
			{ path: "a.ts", search: "2\nthree", replace: "2\n3" },
		]);
		expect(r.ok && r.files[0].after).toBe("one\n2\n3\n");
	});

	it("creates a new file with an empty search", () => {
		const r = applyEdits(files, [{ path: "b.ts", search: "", replace: "new" }]);
		expect(r).toEqual({
			ok: true,
			files: [{ path: "b.ts", before: null, after: "new" }],
		});
	});

	it("rejects creating a file that already exists", () => {
		const r = applyEdits(files, [{ path: "a.ts", search: "", replace: "x" }]);
		expect(r.ok).toBe(false);
	});

	it("rejects editing a file that does not exist", () => {
		const r = applyEdits(files, [
			{ path: "zzz.ts", search: "x", replace: "y" },
		]);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.problems[0]).toContain("does not exist");
	});

	it("rejects no-op edits", () => {
		const r = applyEdits(files, [
			{ path: "a.ts", search: "two", replace: "two" },
		]);
		expect(r.ok).toBe(false);
	});

	it("keeps dollar sequences in replacements literal", () => {
		const r = applyEdits(files, [
			{ path: "a.ts", search: "two", replace: "$& $1" },
		]);
		expect(r.ok && r.files[0].after).toBe("one\n$& $1\nthree\n");
	});
});
