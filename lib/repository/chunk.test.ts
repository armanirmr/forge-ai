import { describe, it, expect } from "vitest";
import { chunkLines } from "./chunk";

const lines = (n: number) =>
	Array.from({ length: n }, (_, i) => `line${i + 1}`).join("\n");

describe("chunkLines", () => {
	it("returns no chunks for empty content", () => {
		expect(chunkLines("")).toEqual([]);
	});

	it("returns a single chunk for small files", () => {
		const out = chunkLines(lines(5));
		expect(out).toHaveLength(1);
		expect(out[0]).toMatchObject({ startLine: 1, endLine: 5 });
	});

	it("overlaps consecutive chunks and covers every line", () => {
		const out = chunkLines(lines(100), { size: 40, overlap: 10 });
		expect(out[0]).toMatchObject({ startLine: 1, endLine: 40 });
		expect(out[1]).toMatchObject({ startLine: 31, endLine: 70 });
		expect(out[out.length - 1].endLine).toBe(100);
	});

	it("rejects invalid size/overlap", () => {
		expect(() => chunkLines("a", { size: 10, overlap: 10 })).toThrow();
	});
});
