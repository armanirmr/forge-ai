const BLOCKED_SEGMENTS = new Set([".git", "node_modules"]);

/** Paths come from GitHub and from model output, so validate before writing to disk. */
export function isSafeRelativePath(path: string): boolean {
	if (path.length === 0 || path.length > 300) return false;
	if (path.includes("\\") || path.includes("\0")) return false;
	if (path.startsWith("/") || /^[A-Za-z]:/.test(path)) return false;
	return path
		.split("/")
		.every(
			(s) => s !== "" && s !== "." && s !== ".." && !BLOCKED_SEGMENTS.has(s),
		);
}
