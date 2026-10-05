import { describe, it, expect } from "vitest";
import { shouldIndexFile, MAX_INDEXABLE_BYTES } from "./ignore";

describe("shouldIndexFile", () => {
	it("indexes normal source files", () => {
		expect(shouldIndexFile("src/auth/session.ts", 1200)).toEqual({
			index: true,
		});
	});

	it.each(["node_modules", ".git", ".next", "dist", "build", "coverage"])(
		"ignores files inside %s",
		(dir) => {
			expect(shouldIndexFile(`${dir}/x/y.js`, 10)).toEqual({
				index: false,
				reason: "ignored_directory",
			});
		},
	);

	it("never indexes .env files, including nested and variant ones", () => {
		for (const p of [".env", ".env.local", "apps/web/.env.production"]) {
			expect(shouldIndexFile(p, 10)).toEqual({
				index: false,
				reason: "env_file",
			});
		}
	});

	it("allows .env.example", () => {
		expect(shouldIndexFile(".env.example", 10)).toEqual({ index: true });
	});

	it("ignores binary, generated and oversized files", () => {
		expect(shouldIndexFile("logo.png", 10)).toEqual({
			index: false,
			reason: "binary",
		});
		expect(shouldIndexFile("package-lock.json", 10)).toEqual({
			index: false,
			reason: "generated",
		});
		expect(shouldIndexFile("public/app.min.js", 10)).toEqual({
			index: false,
			reason: "generated",
		});
		expect(shouldIndexFile("big.ts", MAX_INDEXABLE_BYTES + 1)).toEqual({
			index: false,
			reason: "too_large",
		});
	});
});
