export type Check = { name: "typecheck" | "lint" | "test"; command: string[] };

export type CheckSelection = {
	checks: Check[];
	skipped: { name: string; reason: string }[];
	error: string | null;
};

const DEFINITIONS: Check[] = [
	{ name: "typecheck", command: ["npm", "run", "typecheck"] },
	{ name: "lint", command: ["npm", "run", "lint"] },
	{ name: "test", command: ["npm", "test"] },
];

const NPM_PLACEHOLDER = /no test specified/i;

/** Chooses commands from package.json scripts. The model never picks commands. */
export function selectChecks(
	packageJsonText: string | undefined,
): CheckSelection {
	if (packageJsonText === undefined) {
		return {
			checks: [],
			skipped: [],
			error:
				"The repository has no package.json, so there are no scripts to run.",
		};
	}

	let scripts: Record<string, unknown> = {};
	try {
		const parsed: unknown = JSON.parse(packageJsonText);
		const raw =
			typeof parsed === "object" && parsed !== null
				? (parsed as { scripts?: unknown }).scripts
				: undefined;
		if (typeof raw === "object" && raw !== null)
			scripts = raw as Record<string, unknown>;
	} catch {
		return {
			checks: [],
			skipped: [],
			error: "package.json is not valid JSON.",
		};
	}

	const checks: Check[] = [];
	const skipped: { name: string; reason: string }[] = [];

	for (const def of DEFINITIONS) {
		const script = scripts[def.name];
		if (typeof script !== "string" || script.trim() === "") {
			skipped.push({
				name: def.name,
				reason: `No "${def.name}" script in package.json`,
			});
		} else if (def.name === "test" && NPM_PLACEHOLDER.test(script)) {
			skipped.push({
				name: def.name,
				reason: `The "test" script is npm's placeholder`,
			});
		} else {
			checks.push(def);
		}
	}

	return { checks, skipped, error: null };
}
