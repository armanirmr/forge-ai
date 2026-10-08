import {
	CHANGE_REVIEW_PROMPT_VERSION,
	CHANGE_REVIEW_SYSTEM_PROMPT,
	buildChangeReviewMessage,
} from "@/ai/prompts/change-review";
import {
	ChangeReviewInputSchema,
	ChangeReviewSchema,
	type ChangeReview,
	type ChangeReviewInput,
} from "@/ai/schemas/change-review";
import { evidenceInLines } from "@/lib/review/evidence";
import type { AgentDefinition } from "./types";

/** Findings about something absent have nothing to quote. */
const ABSENCE_CATEGORIES = new Set(["requirement_gap", "test_gap"]);
const CARDINALITY_WORDS: Record<string, string> = {
	single: "1",
	one: "1",
	two: "2",
	three: "3",
	four: "4",
	five: "5",
	six: "6",
	seven: "7",
	eight: "8",
	nine: "9",
	ten: "10",
};
const EXPECTED_CARDINALITY_RE =
	/\b(?:expect(?:s|ed)?|require(?:s|d)?|must|should|only|exactly|just|limited to|at most|at least|instead of|rather than)\b[^.!?]{0,80}?\b(single|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:csv\s+)?(?:rows?|reports?|records?|items?)\b/gi;

function cardinalityClaims(text: string): string[] {
	return [...text.matchAll(EXPECTED_CARDINALITY_RE)].map((match) => {
		const value = match[1].toLowerCase();
		return CARDINALITY_WORDS[value] ?? value;
	});
}

function hasUnsupportedCardinality(text: string, specifiedCounts: Set<string>): boolean {
	return cardinalityClaims(text).some((count) => !specifiedCounts.has(count));
}

function safeChangeReview(input: ChangeReviewInput, output: ChangeReview): ChangeReview {
	const specification = [
		input.requirement,
		...input.requirements.map((r) => r.description),
		...input.acceptanceCriteria.map((c) => c.text),
	].join("\n");
	const specifiedCounts = new Set(cardinalityClaims(specification));
	const affectedCriteria = new Set<string>();
	const keepFindings = output.findings.filter((f) => {
		const unsupported = hasUnsupportedCardinality(
			`${f.title}\n${f.detail}`,
			specifiedCounts,
		);
		if (unsupported && f.criterionId) affectedCriteria.add(f.criterionId);
		return !unsupported;
	});
	const summaryUnsupported = hasUnsupportedCardinality(output.summary, specifiedCounts);
	const criteriaCoverage = output.criteriaCoverage.map((coverage) => {
		if (
			(summaryUnsupported && coverage.status === "not_implemented") ||
			affectedCriteria.has(coverage.criterionId) ||
			hasUnsupportedCardinality(coverage.note, specifiedCounts)
		) {
			return {
				...coverage,
				status: "unclear" as const,
				evidence: null,
				note: "An unsupported exact-count claim affected this verdict; assess it directly against the requirement and diff.",
			};
		}
		return coverage;
	});

	if (!summaryUnsupported && keepFindings.length === output.findings.length && criteriaCoverage.every((c, i) => c === output.criteriaCoverage[i])) {
		return output;
	}

	const summary = summaryUnsupported
		? "The reviewer made an exact-count claim that is not stated in the requirement. That claim was removed; assess report cardinality directly from the requirement and diff."
		: output.summary;
	return {
		...output,
		summary: `${summary} Unsupported count claims and affected findings or verdicts were removed or marked unclear.`.slice(0, 800),
		findings: keepFindings,
		criteriaCoverage,
	};
}

export const changeReviewer: AgentDefinition<ChangeReviewInput, ChangeReview> =
	{
		name: "change-reviewer",
		purpose:
			"Submit an evidence-backed review of the final diff against the requirement.",
		schemaName: "submit_change_review",
		promptVersion: CHANGE_REVIEW_PROMPT_VERSION,
		systemPrompt: CHANGE_REVIEW_SYSTEM_PROMPT,
		inputSchema: ChangeReviewInputSchema,
		outputSchema: ChangeReviewSchema,
		buildUserMessage: buildChangeReviewMessage,
		normalizeOutput: safeChangeReview,
		semanticChecks(input, output) {
			const problems: string[] = [];
			const lines = input.files.flatMap((f) =>
				f.hunks.flatMap((h) => h.lines.map((l) => l.text)),
			);
			const paths = new Set([
				...input.files.map((f) => f.path),
				...input.omittedPaths,
			]);
			const ids = new Set(input.acceptanceCriteria.map((c) => c.id));
			output.findings.forEach((f, i) => {
				const label = `finding ${i + 1}`;
				if (f.path !== null && !paths.has(f.path)) {
					problems.push(
						`${label}: path ${f.path} is not a changed file; use null or copy one of these paths exactly: ${[...paths].join(", ") || "(none)"}`,
					);
				}
				if (f.criterionId !== null && !ids.has(f.criterionId)) {
					problems.push(`${label}: unknown criterionId ${f.criterionId}`);
				}
				if (f.evidence === null) {
					if (!ABSENCE_CATEGORIES.has(f.category)) {
						problems.push(
							`${label}: evidence is required for ${f.category}; copy one line from the diff`,
						);
					}
				} else if (!evidenceInLines(f.evidence, lines)) {
					problems.push(
						`${label}: evidence is not an exact line or substring from the diff; copy it verbatim without the leading marker and its following space, or omit the finding.`,
					);
				}
			});

			const seen = new Set<string>();
			output.criteriaCoverage.forEach((c, i) => {
				const label = `criteriaCoverage ${i + 1}`;
				if (!ids.has(c.criterionId)) {
					problems.push(`${label}: unknown criterionId ${c.criterionId}`);
				} else if (seen.has(c.criterionId)) {
					problems.push(`${label}: ${c.criterionId} appears more than once`);
				}
				seen.add(c.criterionId);
				if (
					c.status === "implemented_and_tested" ||
					c.status === "implemented_not_tested"
				) {
					if (c.evidence === null) {
						problems.push(`${label}: ${c.status} requires evidence`);
					} else if (!evidenceInLines(c.evidence, lines)) {
						problems.push(
							`${label} (${c.criterionId}): evidence is not an exact line or substring from the diff. Copy one verbatim diff line without its leading marker and following space; if you cannot, set status to unclear and evidence to null. Do not quote the requirement or paraphrase code.`,
						);
					}
				}
			});
			for (const id of ids) {
				if (!seen.has(id)) problems.push(`criteriaCoverage is missing ${id}`);
			}
			return problems;
		},
	};
