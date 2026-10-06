import { describe, it, expect } from "vitest";
import { collectImportClosure, resolveLocalImports } from "./local-imports";

const paths = new Set([
	"src/api/reports.ts",
	"src/auth/session.ts",
	"src/middleware/auth.ts",
	"src/lib/index.ts",
	"src/util.ts",
]);

describe("resolveLocalImports", () => {
	it("resolves sibling and parent-directory imports", () => {
		const src = `import { a } from "../middleware/auth";\nimport { b } from "./../auth/session";`;
		expect(resolveLocalImports("src/api/reports.ts", src, paths)).toEqual([
			"src/middleware/auth.ts",
			"src/auth/session.ts",
		]);
	});

	it("ignores packages and path aliases", () => {
		const src = `import z from "zod";\nimport x from "@/lib/db";\nimport y from "node:fs";`;
		expect(resolveLocalImports("src/api/reports.ts", src, paths)).toEqual([]);
	});

	it("resolves directory imports to index files", () => {
		expect(
			resolveLocalImports(
				"src/api/reports.ts",
				`import l from "../lib";`,
				paths,
			),
		).toEqual(["src/lib/index.ts"]);
	});

	it("maps ESM-style .js specifiers to .ts files", () => {
		expect(
			resolveLocalImports(
				"src/api/reports.ts",
				`import u from "../util.js";`,
				paths,
			),
		).toEqual(["src/util.ts"]);
	});

	it("handles type imports, re-exports and dynamic imports", () => {
		const src = [
			`import type { U } from "../auth/session";`,
			`export { r } from "../middleware/auth";`,
			`const m = await import("../util");`,
		].join("\n");
		expect(resolveLocalImports("src/api/reports.ts", src, paths)).toEqual([
			"src/auth/session.ts",
			"src/middleware/auth.ts",
			"src/util.ts",
		]);
	});

	it("does not follow imports that escape the repository root", () => {
		expect(
			resolveLocalImports(
				"src/util.ts",
				`import x from "../../outside";`,
				paths,
			),
		).toEqual([]);
	});
});

describe("collectImportClosure", () => {
	it("follows imports to the given depth and excludes the roots", async () => {
		const all = new Set(["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts"]);
		const contents = new Map([
			["src/b.ts", `import { c } from "./c";`],
			["src/c.ts", `import { d } from "./d";`],
			["src/d.ts", ``],
		]);
		const load = async (ps: string[]) =>
			new Map(ps.map((p) => [p, contents.get(p) ?? ""]));
		const out = await collectImportClosure(
			[{ path: "src/a.ts", content: `import { b } from "./b";` }],
			all,
			load,
			2,
		);
		expect(out).toEqual(["src/b.ts", "src/c.ts"]);
	});

	it("handles import cycles", async () => {
		const all = new Set(["src/a.ts", "src/b.ts"]);
		const load = async (ps: string[]) =>
			new Map(ps.map((p) => [p, `import x from "./a";`]));
		const out = await collectImportClosure(
			[{ path: "src/a.ts", content: `import x from "./b";` }],
			all,
			load,
			3,
		);
		expect(out).toEqual(["src/b.ts"]);
	});
});
