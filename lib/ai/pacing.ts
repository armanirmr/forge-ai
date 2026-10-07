import type {
	AIProvider,
	StructuredRequest,
	StructuredResponse,
} from "@/ai/providers/types";
import { RateLimiter } from "./rate-limiter";

/** Rough estimate: ~4 characters per token, plus a reserve for the answer. */
export function estimateTokens(req: StructuredRequest, outputReserve: number) {
	const chars =
		req.system.length + req.user.length + JSON.stringify(req.jsonSchema).length;
	return Math.ceil(chars / 4) + outputReserve;
}

export class PacedProvider implements AIProvider {
	readonly name: string;
	readonly model: string;

	constructor(
		private inner: AIProvider,
		private limiter: RateLimiter,
		private outputReserveTokens = 1000,
	) {
		this.name = inner.name;
		this.model = inner.model;
	}

	async generateStructured(
		req: StructuredRequest,
	): Promise<StructuredResponse> {
		const estimate = estimateTokens(req, this.outputReserveTokens);
		const reservation = await this.limiter.acquire(estimate);

		try {
			const res = await this.inner.generateStructured(req);
			const actual = (res.inputTokens ?? 0) + (res.outputTokens ?? 0);
			this.limiter.complete(reservation, actual > 0 ? actual : estimate);
			return res;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			if (/\b429\b|rate.?limit/i.test(message)) {
				this.limiter.release(reservation);
				this.limiter.recordRateLimit(message);
			}
			throw err;
		}
	}
}

// One limiter per provider+model, kept across dev hot reloads.
const g = globalThis as unknown as {
	__forgeLimiters?: Map<string, RateLimiter>;
};
const limiters = (g.__forgeLimiters ??= new Map<string, RateLimiter>());

function envInt(name: string): number | undefined {
	const raw = process.env[name];
	if (!raw) return undefined;
	const n = Number.parseInt(raw, 10);
	return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function paceProvider(provider: AIProvider): AIProvider {
	const key = `${provider.name}:${provider.model}`;
	let limiter = limiters.get(key);
	if (!limiter) {
		limiter = new RateLimiter({
			tokensPerMinute: envInt("AI_TPM_LIMIT"),
			requestsPerMinute: envInt("AI_RPM_LIMIT"),
			maxWaitMs: envInt("AI_MAX_LOCAL_WAIT_MS"),
		});
		limiters.set(key, limiter);
	}
	return new PacedProvider(
		provider,
		limiter,
		envInt("AI_OUTPUT_RESERVE_TOKENS") ?? 1000,
	);
}
