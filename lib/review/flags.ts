import { TEST_PATH } from "@/lib/patch/weakening";

export type ReviewFlag = { level: "warn" | "info"; message: string };

export type FlagInput = {
	tasks: { id: string; modifiesFiles: string[]; createsFiles: string[] }[];
	/** Every effective edit: generated first, then accepted repairs. */
	edits: { taskId: string; path: string; search: string }[];
	/** Paths touched by accepted repair edits. */
	repairEditPaths: string[];
	skippedChecks: { name: string; reason: string }[];
};

/** Deterministic observations for the reviewer. They never replace reading the diff. */
export function findReviewFlags(input: FlagInput): ReviewFlag[] {
	const planned = new Set(
		input.tasks.flatMap((t) => [...t.modifiesFiles, ...t.createsFiles]),
	);
	const flags: ReviewFlag[] = [];

	for (const path of new Set(input.edits.map((e) => e.path))) {
		if (!planned.has(path)) {
			flags.push({
				level: "warn",
				message: `${path} is edited but not listed in the plan`,
			});
		}
	}
	for (const path of new Set(
		input.edits.filter((e) => e.search === "").map((e) => e.path),
	)) {
		flags.push({ level: "info", message: `Creates new file ${path}` });
	}
	for (const path of new Set(input.repairEditPaths)) {
		flags.push(
			TEST_PATH.test(path)
				? {
						level: "warn",
						message: `A repair edited the test file ${path}: check that no expected value was loosened`,
					}
				: { level: "info", message: `A repair edited ${path}` },
		);
	}
	for (const s of input.skippedChecks) {
		flags.push({
			level: "info",
			message: `${s.name} was not run: ${s.reason}`,
		});
	}
	return [
		...flags.filter((f) => f.level === "warn"),
		...flags.filter((f) => f.level === "info"),
	];
}
