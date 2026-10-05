export type Chunk = { content: string; startLine: number; endLine: number };

export function chunkLines(
	content: string,
	{ size = 60, overlap = 10 }: { size?: number; overlap?: number } = {},
): Chunk[] {
	if (size <= overlap) throw new Error("size must be greater than overlap");
	if (content.length === 0) return [];

	const lines = content.split("\n");
	const chunks: Chunk[] = [];
	const step = size - overlap;

	for (let start = 0; start < lines.length; start += step) {
		const end = Math.min(start + size, lines.length);
		chunks.push({
			content: lines.slice(start, end).join("\n"),
			startLine: start + 1,
			endLine: end,
		});
		if (end === lines.length) break;
	}
	return chunks;
}
