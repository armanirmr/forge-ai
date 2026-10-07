import { describe, expect, it } from "vitest";
import { hashEdits } from "./hash";

const e1 = { taskId: "T1", path: "a.ts", search: "x", replace: "y" };
const e2 = { taskId: "T1", path: "b.ts", search: "", replace: "z" };

describe("hashEdits", () => {
	it("is stable and 64 hex characters", () => {
		expect(hashEdits([e1, e2])).toBe(hashEdits([{ ...e1 }, { ...e2 }]));
		expect(hashEdits([e1, e2])).toMatch(/^[0-9a-f]{64}$/);
	});

	it("changes when an edit changes", () => {
		expect(hashEdits([e1])).not.toBe(hashEdits([{ ...e1, replace: "w" }]));
	});

	it("depends on order", () => {
		expect(hashEdits([e1, e2])).not.toBe(hashEdits([e2, e1]));
	});
});
