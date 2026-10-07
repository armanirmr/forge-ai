import { describe, expect, it } from "vitest";
import { isSafeRelativePath } from "./safe-path";

describe("isSafeRelativePath", () => {
	it("accepts normal repository paths", () => {
		for (const p of [
			"src/a.ts",
			".env.example",
			"tests/x/y.test.ts",
			"package.json",
		]) {
			expect(isSafeRelativePath(p)).toBe(true);
		}
	});

	it("rejects traversal and dot segments", () => {
		for (const p of ["../x", "a/../b", "a/./b", ".."]) {
			expect(isSafeRelativePath(p)).toBe(false);
		}
	});

	it("rejects absolute and drive-letter paths", () => {
		for (const p of ["/etc/passwd", "C:/x", "C:\\x"]) {
			expect(isSafeRelativePath(p)).toBe(false);
		}
	});

	it("rejects empty paths, empty segments, backslashes and NUL", () => {
		for (const p of ["", "a//b", "a/", "a\\b", "a\0b"]) {
			expect(isSafeRelativePath(p)).toBe(false);
		}
	});

	it("rejects .git and node_modules segments", () => {
		for (const p of [".git/config", "a/node_modules/x.js"]) {
			expect(isSafeRelativePath(p)).toBe(false);
		}
	});
});
