import { describe, expect, it } from "vitest";
import { FakeProvider } from "@/ai/providers/fake";
import { PacedProvider } from "./pacing";
import { LocalPacingError, RateLimiter } from "./rate-limiter";

const req = {
	system: "sys",
	user: "usr",
	schemaName: "s",
	schemaDescription: "d",
	jsonSchema: { type: "object" },
};

describe("PacedProvider", () => {
	it("passes results through and records real usage", async () => {
		const limiter = new RateLimiter({ tokensPerMinute: 8000 });
		const p = new PacedProvider(new FakeProvider([{ ok: 1 }]), limiter);
		await p.generateStructured(req);
		expect(limiter.snapshot().usedTokens).toBe(15); // FakeProvider reports 10 + 5
	});

	it("does not call the provider while cooling down", async () => {
		const inner = new FakeProvider([
			new Error("429 rate limit. Please try again in 7m12.5s"),
			{ ok: 1 },
		]);
		const p = new PacedProvider(inner, new RateLimiter({ maxWaitMs: 60_000 }));

		await expect(p.generateStructured(req)).rejects.toThrow(/429/);
		await expect(p.generateStructured(req)).rejects.toBeInstanceOf(
			LocalPacingError,
		);
		expect(inner.requests).toHaveLength(1);
	});

	it("does not start a cooldown for non-rate-limit errors", async () => {
		const inner = new FakeProvider([new Error("401 invalid key"), { ok: 1 }]);
		const limiter = new RateLimiter();
		const p = new PacedProvider(inner, limiter);

		await expect(p.generateStructured(req)).rejects.toThrow(/401/);
		expect(limiter.snapshot().cooldownRemainingMs).toBe(0);
		await expect(p.generateStructured(req)).resolves.toBeDefined();
	});
});
