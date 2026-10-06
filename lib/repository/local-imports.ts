const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

// import x from "./a" | import "./a" | export { x } from "./a" | import("./a") | require("./a")
const SPECIFIER =
	/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["']([^"']+)["']/g;

/** Joins a directory and a relative specifier. Returns null if it escapes the repository root. */
function joinPath(dir: string, spec: string): string | null {
	const stack = dir ? dir.split("/") : [];
	for (const part of spec.split("/")) {
		if (part === "." || part === "") continue;
		if (part === "..") {
			if (stack.length === 0) return null;
			stack.pop();
		} else {
			stack.push(part);
		}
	}
	return stack.join("/");
}

/**
 * Finds the repository files that a JS/TS file imports through RELATIVE specifiers.
 * Package imports and path aliases are ignored. Only paths in `allPaths` are returned.
 */
export function resolveLocalImports(
	fromPath: string,
	content: string,
	allPaths: Set<string>,
): string[] {
	const dir = fromPath.includes("/")
		? fromPath.slice(0, fromPath.lastIndexOf("/"))
		: "";
	const found: string[] = [];

	for (const match of content.matchAll(SPECIFIER)) {
		const spec = match[1];
		if (!spec.startsWith(".")) continue;
		const base = joinPath(dir, spec);
		if (base === null) continue;

		const candidates = [
			base,
			...EXTENSIONS.map((e) => `${base}${e}`),
			...EXTENSIONS.map((e) => `${base}/index${e}`),
		];
		// ESM-style "./x.js" that points at x.ts
		const stripped = base.replace(/\.[cm]?jsx?$/, "");
		if (stripped !== base)
			candidates.push(...EXTENSIONS.map((e) => `${stripped}${e}`));

		const hit = candidates.find((c) => allPaths.has(c));
		if (hit && !found.includes(hit)) found.push(hit);
	}
	return found;
}

/**
 * Breadth-first closure of local imports starting from `roots`, up to `depth` levels.
 * Returns the imported paths in discovery order, excluding the roots themselves.
 * `load` supplies file contents for the next level.
 */
export async function collectImportClosure(
	roots: { path: string; content: string }[],
	allPaths: Set<string>,
	load: (paths: string[]) => Promise<Map<string, string>>,
	depth = 2,
): Promise<string[]> {
	const seen = new Set(roots.map((r) => r.path));
	const ordered: string[] = [];
	let frontier = roots;

	for (let level = 0; level < depth; level++) {
		const next: string[] = [];
		for (const file of frontier) {
			for (const p of resolveLocalImports(file.path, file.content, allPaths)) {
				if (seen.has(p)) continue;
				seen.add(p);
				next.push(p);
				ordered.push(p);
			}
		}
		if (next.length === 0) break;
		const loaded = await load(next);
		frontier = next.map((path) => ({ path, content: loaded.get(path) ?? "" }));
	}
	return ordered;
}
