export type Chunk = { content: string; startLine: number; endLine: number };

export function chunkLines(
	content: string,
	{
		size = 60,
		overlap = 10,
		maxChars = 6000,
	}: { size?: number; overlap?: number; maxChars?: number } = {},
): Chunk[] {
	if (size <= overlap) throw new Error("size must be greater than overlap");
	if (maxChars < 1) throw new Error("maxChars must be positive");
	if (content.length === 0) return [];

	const sourceLines = content.split("\n");
	const lines: { text: string; sourceLine: number }[] = [];
	for (let i = 0; i < sourceLines.length; i++) {
		const line = sourceLines[i];
		if (line.length <= maxChars) {
			lines.push({ text: line, sourceLine: i + 1 });
			continue;
		}
		for (let offset = 0; offset < line.length; offset += maxChars) {
			lines.push({ text: line.slice(offset, offset + maxChars), sourceLine: i + 1 });
		}
	}
	const chunks: Chunk[] = [];
	for (let start = 0; start < lines.length;) {
		let end = start;
		let chars = 0;
		while (end < lines.length && end - start < size) {
			const nextLength = lines[end].text.length + (end === start ? 0 : 1);
			if (chars + nextLength > maxChars && end > start) break;
			chars += nextLength;
			end++;
		}
		chunks.push({
			content: lines.slice(start, end).map((line) => line.text).join("\n"),
			startLine: lines[start].sourceLine,
			endLine: lines[end - 1].sourceLine,
		});
		if (end === lines.length) break;
		start = Math.max(start + 1, end - overlap);
	}
	return chunks;
}
