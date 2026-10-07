export const TEST_PATH = /(^|\/)(tests?|__tests__)\/|\.(test|spec)\.[cm]?[jt]sx?$/;
const DISABLERS =
	/\b(?:it|test|describe)\.(?:skip|todo|only)\s*\(|\b(?:xit|xtest|xdescribe|fit|fdescribe)\s*\(/;
const CASES = /\b(?:it|test)\s*\(/g;
const ASSERTIONS = /\bexpect\s*\(/g;

const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;

/**
 * Heuristic guard: a "fix" must not work by weakening tests. It cannot detect a
 * loosened expected value, so repair diffs still need a human read.
 */
export function findTestWeakening(
	edits: { path: string; search: string; replace: string }[],
): string[] {
	const problems: string[] = [];
	edits.forEach((e, i) => {
		if (!TEST_PATH.test(e.path)) return;
		const label = `edit ${i + 1} (${e.path})`;
		if (DISABLERS.test(e.replace) && !DISABLERS.test(e.search)) {
			problems.push(
				`${label}: disables tests with skip/todo/only; fix the cause instead`,
			);
		}
		if (count(e.search, CASES) > count(e.replace, CASES)) {
			problems.push(
				`${label}: removes a test case; keep every test and fix the cause`,
			);
		}
		if (count(e.search, ASSERTIONS) > count(e.replace, ASSERTIONS)) {
			problems.push(`${label}: removes an assertion; keep every assertion`);
		}
	});
	return problems;
}
