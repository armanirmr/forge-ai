const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** True when the quote is part of one of the diff lines, ignoring whitespace differences. */
export function evidenceInLines(evidence: string, lines: string[]): boolean {
	const needle = squash(evidence);
	if (needle === "") return false;
	return lines.some((line) => squash(line).includes(needle));
}
