export type RedactionResult = { text: string; redactions: number };

const PATTERNS: { name: string; regex: RegExp }[] = [
	{
		name: "private-key",
		regex:
			/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
	},
	{
		name: "github-token",
		regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/g,
	},
	{ name: "github-pat", regex: /\bgithub_pat_[A-Za-z0-9_]{50,}\b/g },
	{ name: "aws-access-key", regex: /\bAKIA[0-9A-Z]{16}\b/g },
	{ name: "api-key", regex: /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}\b/g },
	{
		name: "secret-assignment",
		regex:
			/\b([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY)[A-Z0-9_]*)\s*=\s*["']?[^\s"']{6,}["']?/g,
	},
];

/**
 * Best-effort redaction of obvious secrets before content is sent to an AI
 * provider. This is a safety net, NOT a guarantee: scoped context selection
 * and never indexing .env files remain the primary controls.
 */
export function redactSecrets(input: string): RedactionResult {
	let redactions = 0;
	let text = input;

	for (const { name, regex } of PATTERNS) {
		text = text.replace(regex, (_match, key?: string) => {
			redactions += 1;
			return name === "secret-assignment" && key
				? `${key}=[REDACTED]`
				: `[REDACTED:${name}]`;
		});
	}

	return { text, redactions };
}
