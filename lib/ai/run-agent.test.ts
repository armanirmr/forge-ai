import { describe, it, expect } from "vitest";
import { z } from "zod";
import type { AgentDefinition } from "@/ai/agents/types";
import { FakeProvider } from "@/ai/providers/fake";
import {
	runAgent,
	isTransientProviderError,
	parseRetryAfterMs,
	transientWaitMs,
} from "./run-agent";

const def: AgentDefinition<{ q: string }, { answer: string }> = {
	name: "test-agent",
	purpose: "test",
	schemaName: "submit",
	promptVersion: "test@1",
	systemPrompt: "sys",
	inputSchema: z.object({ q: z.string() }),
	outputSchema: z.object({ answer: z.string().min(1) }),
	buildUserMessage: (i) => i.q,
	semanticChecks: (_i, o) =>
		o.answer === "forbidden" ? ["answer must not be 'forbidden'"] : [],
};

describe("runAgent", () => {
	it("returns validated output on the first attempt", async () => {
		const p = new FakeProvider([{ answer: "ok" }]);
		const r = await runAgent(def, { q: "hi" }, p);
		expect(r).toMatchObject({ ok: true, output: { answer: "ok" } });
		expect(r.attempts.map((a) => a.status)).toEqual(["succeeded"]);
	});

	it("repairs once after a schema failure and tells the model why", async () => {
		const p = new FakeProvider([{ answer: "" }, { answer: "fixed" }]);
		const r = await runAgent(def, { q: "hi" }, p);
		expect(r.ok).toBe(true);
		expect(r.attempts.map((a) => a.status)).toEqual([
			"validation_failed",
			"succeeded",
		]);
		expect(p.requests[1].user).toContain("previous_attempt_rejected");
	});

	it("fails after max attempts and never returns invalid output", async () => {
		const p = new FakeProvider([{ nope: 1 }, { nope: 2 }]);
		const r = await runAgent(def, { q: "hi" }, p);
		expect(r.ok).toBe(false);
		expect(r.attempts).toHaveLength(2);
	});

	it("applies semantic checks", async () => {
		const p = new FakeProvider([
			{ answer: "forbidden" },
			{ answer: "forbidden" },
		]);
		const r = await runAgent(def, { q: "hi" }, p);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error).toContain("forbidden");
	});

	it("surfaces provider errors without retrying", async () => {
		const p = new FakeProvider([new Error("boom")]);
		const r = await runAgent(def, { q: "hi" }, p);
		expect(r).toMatchObject({ ok: false });
		expect(r.attempts.map((a) => a.status)).toEqual(["failed"]);
	});

	it("rejects invalid input before calling the provider", async () => {
		const p = new FakeProvider([]);
		const r = await runAgent(def, { q: 5 }, p);
		expect(r.ok).toBe(false);
		expect(p.requests).toHaveLength(0);
	});

	it("retries transient provider errors, then succeeds", async () => {
		const p = new FakeProvider([
			new Error("503 UNAVAILABLE"),
			{ answer: "ok" },
		]);
		const r = await runAgent(def, { q: "hi" }, p, {
			transientRetryDelaysMs: [0],
		});
		expect(r.ok).toBe(true);
		expect(r.attempts.map((a) => a.status)).toEqual(["failed", "succeeded"]);
	});

	it("gives up after the transient retry budget is spent", async () => {
		const p = new FakeProvider([
			new Error("503 UNAVAILABLE"),
			new Error("503 UNAVAILABLE"),
			new Error("503 UNAVAILABLE"),
		]);
		const r = await runAgent(def, { q: "hi" }, p, {
			transientRetryDelaysMs: [0, 0],
		});
		expect(r.ok).toBe(false);
		expect(r.attempts).toHaveLength(3);
	});

	it("does not retry non-transient provider errors", async () => {
		const p = new FakeProvider([new Error("401 invalid API key")]);
		const r = await runAgent(def, { q: "hi" }, p, {
			transientRetryDelaysMs: [0, 0],
		});
		expect(r.ok).toBe(false);
		expect(r.attempts).toHaveLength(1);
	});

	it("classifies transient errors", () => {
		expect(
			isTransientProviderError('{"error":{"code":503,"status":"UNAVAILABLE"}}'),
		).toBe(true);
		expect(isTransientProviderError("RESOURCE_EXHAUSTED")).toBe(true);
		expect(isTransientProviderError("model not found")).toBe(false);
		expect(
			isTransientProviderError('{"error":{"code":"json_validate_failed"}}'),
		).toBe(false);
	});

	it("reads the retry hint from rate-limit messages", () => {
		expect(parseRetryAfterMs("Please try again in 3.495s.")).toBe(3495);
		expect(parseRetryAfterMs("Please try again in 224.999999ms.")).toBe(225);
		expect(parseRetryAfterMs("model not found")).toBeNull();
	});

	it("waits at least 30 s on a rate limit without a hint", () => {
		expect(
			transientWaitMs('{"message":"Rate limit exceeded","code":"1300"}', 2000),
		).toBe(30000);
		expect(transientWaitMs("503 UNAVAILABLE", 2000)).toBe(2000);
		expect(transientWaitMs("try again in 3.495s", 2000)).toBe(3995);
	});
});
