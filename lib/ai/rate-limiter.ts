const WINDOW_MS = 60_000;

/** Parses "try again in 5.75s", "224.99ms" or "7m12.5s". Null if absent. */
export function parseRetryHintMs(message: string): number | null {
	const m = /try again in\s+((?:\d+(?:\.\d+)?\s*(?:ms|h|m|s)\s*)+)/i.exec(
		message,
	);
	if (!m) return null;
	let total = 0;
	for (const part of m[1].matchAll(/(\d+(?:\.\d+)?)\s*(ms|h|m|s)/gi)) {
		const value = Number(part[1]);
		const unit = part[2].toLowerCase();
		total +=
			unit === "ms"
				? value
				: unit === "s"
					? value * 1000
					: unit === "m"
						? value * 60_000
						: value * 3_600_000;
	}
	return total > 0 ? Math.round(total) : null;
}

/** "45 s", "7 min", "7 min 9 s". */
export function formatWait(ms: number): string {
	const total = Math.ceil(ms / 1000);
	if (total < 60) return `${total} s`;
	const min = Math.floor(total / 60);
	const sec = total % 60;
	return sec === 0 ? `${min} min` : `${min} min ${sec} s`;
}

/** Thrown when a request is deliberately NOT sent because it would fail. Not retried. */
export class LocalPacingError extends Error {
	constructor(
		message: string,
		readonly waitMs: number | null,
	) {
		super(message);
		this.name = "LocalPacingError";
	}
}

export type RateLimiterConfig = {
	tokensPerMinute?: number;
	requestsPerMinute?: number;
	/** Longest we will sleep locally before giving up and reporting the wait. */
	maxWaitMs?: number;
	now?: () => number;
	sleep?: (ms: number) => Promise<void>;
};

type Entry = { id: number; at: number; tokens: number };

export class RateLimiter {
	tokensPerMinute?: number;
	requestsPerMinute?: number;
	private maxWaitMs: number;
	private now: () => number;
	private sleep: (ms: number) => Promise<void>;
	private entries: Entry[] = [];
	private nextId = 1;
	private cooldownUntil = 0;

	constructor(config: RateLimiterConfig = {}) {
		this.tokensPerMinute = config.tokensPerMinute;
		this.requestsPerMinute = config.requestsPerMinute;
		this.maxWaitMs = config.maxWaitMs ?? 60_000;
		this.now = config.now ?? Date.now;
		this.sleep =
			config.sleep ??
			((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
	}

	private prune(now: number) {
		this.entries = this.entries.filter((e) => now - e.at < WINDOW_MS);
	}

	/** Milliseconds until a request of `tokens` would fit. Null if it can never fit. */
	planWaitMs(tokens: number): number | null {
		const now = this.now();
		this.prune(now);
		if (this.tokensPerMinute !== undefined && tokens > this.tokensPerMinute) {
			return null;
		}

		let wait = Math.max(0, this.cooldownUntil - now);

		if (this.tokensPerMinute !== undefined) {
			let used = this.entries.reduce((sum, e) => sum + e.tokens, 0);
			for (const e of this.entries) {
				if (used + tokens <= this.tokensPerMinute) break;
				used -= e.tokens;
				wait = Math.max(wait, e.at + WINDOW_MS - now);
			}
		}

		if (
			this.requestsPerMinute !== undefined &&
			this.entries.length >= this.requestsPerMinute
		) {
			const mustExpire =
				this.entries[this.entries.length - this.requestsPerMinute];
			wait = Math.max(wait, mustExpire.at + WINDOW_MS - now);
		}

		return wait;
	}

	/** Reserves capacity, sleeping if needed. Throws LocalPacingError instead of sending a doomed request. */
	async acquire(tokens: number): Promise<number> {
		for (;;) {
			const wait = this.planWaitMs(tokens);
			if (wait === null) {
				throw new LocalPacingError(
					`This request is estimated at ${tokens} tokens, more than the ${this.tokensPerMinute} tokens-per-minute limit, so it cannot succeed as sent.`,
					null,
				);
			}
			if (wait === 0) {
				const entry: Entry = { id: this.nextId++, at: this.now(), tokens };
				this.entries.push(entry);
				return entry.id;
			}
			if (wait > this.maxWaitMs) {
				throw new LocalPacingError(
					`Request held back to avoid a failure: the provider's limit allows the next one in about ${formatWait(wait)}, longer than the ${formatWait(this.maxWaitMs)} we wait locally. Try again then.`,
					wait,
				);
			}
			await this.sleep(wait + 50);
		}
	}

	/** Replace the estimate with the real usage. */
	complete(id: number, actualTokens: number) {
		const entry = this.entries.find((e) => e.id === id);
		if (entry) entry.tokens = actualTokens;
	}

	/** Forget a reservation (for requests the provider rejected before doing any work). */
	release(id: number) {
		this.entries = this.entries.filter((e) => e.id !== id);
	}

	/** Learn from a provider rate-limit error: set a cooldown and the real token limit. */
	recordRateLimit(message: string) {
		const hint = parseRetryHintMs(message);
		const wait = hint !== null ? hint + 500 : 30_000;
		this.cooldownUntil = Math.max(this.cooldownUntil, this.now() + wait);

		const limit = /tokens per minute \(TPM\):\s*Limit\s+(\d+)/i.exec(message);
		if (limit) this.tokensPerMinute = Number(limit[1]);
	}

	snapshot() {
		const now = this.now();
		this.prune(now);
		return {
			usedTokens: this.entries.reduce((sum, e) => sum + e.tokens, 0),
			requestsInWindow: this.entries.length,
			tokensPerMinute: this.tokensPerMinute,
			requestsPerMinute: this.requestsPerMinute,
			cooldownRemainingMs: Math.max(0, this.cooldownUntil - now),
		};
	}
}
