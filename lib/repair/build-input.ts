import type { StepResult } from "@/lib/verify/types";

const MAX_FAILURES = 2;
const MAX_OUTPUT_CHARS = 8000;

export type Failure = {
	step: string;
	command: string;
	exitCode: number | null;
	timedOut: boolean;
	output: string;
};

/** The failing check steps (never the install step), with the tail of their output. */
export function pickFailures(steps: StepResult[]): Failure[] {
	return steps
		.filter((s) => s.name !== "install" && (s.exitCode !== 0 || s.timedOut))
		.slice(0, MAX_FAILURES)
		.map((s) => ({
			step: s.name,
			command: s.command,
			exitCode: s.exitCode,
			timedOut: s.timedOut,
			output: s.output.slice(-MAX_OUTPUT_CHARS),
		}));
}

/** Repository files whose paths appear in the failure output, for read-only context. */
export function pickMentionedPaths(
	outputs: string[],
	candidates: string[],
	exclude: Set<string>,
	max: number,
): string[] {
	const text = outputs.join("\n");
	const picked: string[] = [];
	for (const path of candidates) {
		if (exclude.has(path) || !text.includes(path)) continue;
		picked.push(path);
		if (picked.length >= max) break;
	}
	return picked;
}
