import {
	CODE_GENERATION_PROMPT_VERSION,
	CODE_GENERATION_SYSTEM_PROMPT,
	buildCodeGenerationMessage,
} from "@/ai/prompts/code-generation";
import {
	CodeChangeSchema,
	CodeGenerationInputSchema,
	type CodeChange,
	type CodeGenerationInput,
} from "@/ai/schemas/code-generation";
import { applyEdits } from "@/lib/patch/apply-edits";
import { findMissingCoverage } from "@/lib/patch/coverage";
import { redactSecrets } from "@/lib/security/redact";
import type { AgentDefinition } from "./types";

export const codeGenerator: AgentDefinition<CodeGenerationInput, CodeChange> = {
	name: "code-generator",
	purpose: "Submit the code edits that implement the approved plan.",
	schemaName: "submit_code_changes",
	promptVersion: CODE_GENERATION_PROMPT_VERSION,
	systemPrompt: CODE_GENERATION_SYSTEM_PROMPT,
	inputSchema: CodeGenerationInputSchema,
	outputSchema: CodeChangeSchema,
	buildUserMessage: buildCodeGenerationMessage,
	semanticChecks(input, output) {
		const problems: string[] = [];
		const tasks = new Map(input.plan.tasks.map((t) => [t.id, t]));

		output.edits.forEach((e, i) => {
			problems.push(...findMissingCoverage(input.plan.tasks, output.edits));
			const label = `edit ${i + 1} (${e.path})`;
			const task = tasks.get(e.taskId);
			if (!task) {
				problems.push(`${label}: unknown task ${e.taskId}`);
			} else {
				const allowed =
					e.search === ""
						? task.createsFiles
						: [...task.modifiesFiles, ...task.createsFiles];
				if (!allowed.includes(e.path)) {
					problems.push(`${label}: path is outside the scope of ${e.taskId}`);
				}
			}
			if (redactSecrets(e.replace).redactions > 0) {
				problems.push(
					`${label}: replacement contains something that looks like a secret`,
				);
			}
		});

		const files = Object.fromEntries(
			input.editableFiles.map((f) => [f.path, f.content]),
		);
		const applied = applyEdits(files, output.edits);
		if (!applied.ok) problems.push(...applied.problems);

		return problems;
	},
};
