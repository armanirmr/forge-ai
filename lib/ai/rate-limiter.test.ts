import { describe, expect, it } from "vitest";
import {
	LocalPacingError,
	RateLimiter,
	formatWait,
	parseRetryHintMs,
} from "./rate-limiter";

function makeLimiter(
	config: ConstructorParameters<typeof RateLimiter>[0] = {},
) {
	let t = 0;
	const limiter = new RateLimiter({
		now: () => t,
		sleep: async (ms) => {
			t += ms;
		},
		...config,
	});
	return { limiter, advance: (ms: number) => (t += ms), time: () => t };
}

describe("parseRetryHintMs / formatWait", () => {
	it("parses seconds, milliseconds and minute-second hints", () => {
		expect(parseRetryHintMs("Please try again in 5.7525s.")).toBe(5753);
		expect(parseRetryHintMs("try again in 224.99ms")).toBe(225);
		expect(parseRetryHintMs("try again in 7m12.5s")).toBe(432_500);
		expect(parseRetryHintMs("no hint")).toBeNull();
		expect(formatWait(432_500)).toBe("7 min 13 s");
		expect(formatWait(45_000)).toBe("45 s");
		expect(formatWait(120_000)).toBe("2 min");
	});
});

describe("RateLimiter", () => {
	it("lets a request through when under the limits", async () => {
		const { limiter } = makeLimiter({ tokensPerMinute: 8000 });
		expect(limiter.planWaitMs(4000)).toBe(0);
		await limiter.acquire(4000);
		expect(limiter.snapshot().usedTokens).toBe(4000);
	});

	it("waits until enough earlier usage leaves the window", async () => {
		const { limiter, advance } = makeLimiter({ tokensPerMinute: 8000 });
		await limiter.acquire(5000);
		advance(10_000);
		expect(limiter.planWaitMs(4000)).toBe(50_000);
	});

	it("replaces the estimate with real usage after completion", async () => {
		const { limiter } = makeLimiter({ tokensPerMinute: 8000 });
		const id = await limiter.acquire(5000);
		limiter.complete(id, 700);
		expect(limiter.snapshot().usedTokens).toBe(700);
		expect(limiter.planWaitMs(7000)).toBe(0);
	});

	it("enforces a requests-per-minute limit", async () => {
		const { limiter } = makeLimiter({ requestsPerMinute: 2 });
		await limiter.acquire(10);
		await limiter.acquire(10);
		expect(limiter.planWaitMs(10)).toBe(60_000);
	});

	it("sets a cooldown from a 429 hint and learns the real token limit", () => {
		const { limiter } = makeLimiter();
		limiter.recordRateLimit(
			"429 Rate limit reached on tokens per minute (TPM): Limit 8000, Used 3910, Requested 4857. Please try again in 5.7525s.",
		);
		expect(limiter.tokensPerMinute).toBe(8000);
		expect(limiter.planWaitMs(100)).toBe(6253);
	});

	it("refuses to wait longer than the local cap", async () => {
		const { limiter } = makeLimiter({ maxWaitMs: 60_000 });
		limiter.recordRateLimit("429 ... Please try again in 7m12.5s");
		await expect(limiter.acquire(100)).rejects.toBeInstanceOf(LocalPacingError);
	});

	it("rejects a request that can never fit", async () => {
		const { limiter } = makeLimiter({ tokensPerMinute: 8000 });
		await expect(limiter.acquire(9000)).rejects.toThrow(/cannot succeed/);
	});

	it("sleeps locally for a short wait and then proceeds", async () => {
		const { limiter, time } = makeLimiter({ tokensPerMinute: 8000 });
		await limiter.acquire(5000);
		await limiter.acquire(4000);
		expect(time()).toBeGreaterThanOrEqual(60_000);
		expect(limiter.snapshot().requestsInWindow).toBe(1);
	});

	it("frees capacity when a reservation is released", async () => {
		const { limiter } = makeLimiter({ tokensPerMinute: 8000 });
		const id = await limiter.acquire(7000);
		limiter.release(id);
		expect(limiter.planWaitMs(7000)).toBe(0);
	});
});
