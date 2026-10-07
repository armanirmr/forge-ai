import {
	REPAIR_PROMPT_VERSION,
	REPAIR_SYSTEM_PROMPT,
	buildRepairMessage,
} from "@/ai/prompts/repair";
import {
	RepairInputSchema,
	RepairSchema,
	type Repair,
	type RepairInput,
} from "@/ai/schemas/repair";
import { applyEdits } from "@/lib/patch/apply-edits";
import { findScopeProblems } from "@/lib/patch/scope";
import { findTestWeakening } from "@/lib/patch/weakening";
import { redactSecrets } from "@/lib/security/redact";
import type { AgentDefinition } from "./types";

export const debuggerAgent: AgentDefinition<RepairInput, Repair> = {
	name: "debugger",
	purpose:
		"Submit the root cause and the minimal edits that fix the failing verification.",
	schemaName: "submit_repair",
	promptVersion: REPAIR_PROMPT_VERSION,
	systemPrompt: REPAIR_SYSTEM_PROMPT,
	inputSchema: RepairInputSchema,
	outputSchema: RepairSchema,
	buildUserMessage: buildRepairMessage,
	semanticChecks(input, output) {
		if (output.cannotFixReason !== null) {
			return output.edits.length > 0
				? ["cannotFixReason is set, so edits must be empty"]
				: [];
		}

		const problems: string[] = [];
		if (output.edits.length === 0) {
			problems.push("No edits were returned and cannotFixReason is null");
			return problems;
		}

		problems.push(...findScopeProblems(input.plan.tasks, output.edits));

		output.edits.forEach((e, i) => {
			if (redactSecrets(e.replace).redactions > 0) {
				problems.push(
					`edit ${i + 1} (${e.path}): replacement contains something that looks like a secret`,
				);
			}
		});

		problems.push(...findTestWeakening(output.edits));

		const files = Object.fromEntries(
			input.editableFiles.map((f) => [f.path, f.content]),
		);
		const applied = applyEdits(files, output.edits);
		if (!applied.ok) problems.push(...applied.problems);

		return problems;
	},
};
