const IGNORED_DIRS = new Set([
	"node_modules",
	".git",
	".next",
	"dist",
	"build",
	"coverage",
]);

const BINARY_EXTENSIONS = new Set([
	"png",
	"jpg",
	"jpeg",
	"gif",
	"webp",
	"ico",
	"pdf",
	"zip",
	"gz",
	"tar",
	"woff",
	"woff2",
	"ttf",
	"eot",
	"mp3",
	"mp4",
	"mov",
	"wasm",
	"exe",
	"dll",
	"so",
]);

const GENERATED_FILES = new Set([
	"package-lock.json",
	"pnpm-lock.yaml",
	"yarn.lock",
	"bun.lockb",
]);

export const MAX_INDEXABLE_BYTES = 500_000;

export type IgnoreReason =
	| "ignored_directory"
	| "env_file"
	| "binary"
	| "generated"
	| "too_large";

export type IgnoreDecision =
	| { index: true }
	| { index: false; reason: IgnoreReason };

export function shouldIndexFile(
	path: string,
	sizeBytes: number,
): IgnoreDecision {
	const segments = path.split("/").filter(Boolean);
	const filename = segments[segments.length - 1] ?? "";

	if (segments.slice(0, -1).some((s) => IGNORED_DIRS.has(s))) {
		return { index: false, reason: "ignored_directory" };
	}

	if (
		filename === ".env" ||
		(filename.startsWith(".env.") && filename !== ".env.example")
	) {
		return { index: false, reason: "env_file" };
	}

	const ext = filename.includes(".")
		? filename.split(".").pop()!.toLowerCase()
		: "";
	if (BINARY_EXTENSIONS.has(ext)) return { index: false, reason: "binary" };

	if (
		GENERATED_FILES.has(filename) ||
		/\.min\.(js|css)$/.test(filename) ||
		filename.endsWith(".map")
	) {
		return { index: false, reason: "generated" };
	}

	if (sizeBytes > MAX_INDEXABLE_BYTES)
		return { index: false, reason: "too_large" };

	return { index: true };
}
