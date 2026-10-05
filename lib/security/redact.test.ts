import { describe, it, expect } from "vitest";
import { redactSecrets } from "./redact";

describe("redactSecrets", () => {
	it("leaves ordinary code untouched", () => {
		const src = "export const add = (a: number, b: number) => a + b;";
		expect(redactSecrets(src)).toEqual({ text: src, redactions: 0 });
	});

	it("redacts GitHub tokens", () => {
		const token = "ghp_" + "a".repeat(36);
		const out = redactSecrets(`const t = "${token}"`);
		expect(out.text).not.toContain(token);
		expect(out.redactions).toBe(1);
	});

	it("redacts AWS access keys and sk- API keys", () => {
		const out = redactSecrets(
			"AKIAABCDEFGHIJKLMNOP and sk-ant-" + "x".repeat(30),
		);
		expect(out.text).not.toMatch(/AKIA[0-9A-Z]{16}/);
		expect(out.text).not.toMatch(/sk-ant-/);
		expect(out.redactions).toBe(2);
	});

	it("redacts private key blocks", () => {
		const pem =
			"-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----";
		expect(redactSecrets(pem).text).toBe("[REDACTED:private-key]");
	});

	it("redacts secret-looking env assignments but keeps the key name", () => {
		const out = redactSecrets("DATABASE_PASSWORD=hunter2hunter2");
		expect(out.text).toBe("DATABASE_PASSWORD=[REDACTED]");
		expect(out.redactions).toBe(1);
	});
});
