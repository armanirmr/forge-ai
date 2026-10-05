const BY_EXTENSION: Record<string, string> = {
	ts: "typescript",
	tsx: "typescript",
	js: "javascript",
	jsx: "javascript",
	mjs: "javascript",
	cjs: "javascript",
	py: "python",
	go: "go",
	rs: "rust",
	java: "java",
	rb: "ruby",
	php: "php",
	cs: "csharp",
	css: "css",
	html: "html",
	json: "json",
	md: "markdown",
	yml: "yaml",
	yaml: "yaml",
	sql: "sql",
	sh: "shell",
};

export function detectLanguage(path: string): string | null {
	const ext = path.split(".").pop()?.toLowerCase();
	return (ext && path.includes(".") && BY_EXTENSION[ext]) || null;
}
