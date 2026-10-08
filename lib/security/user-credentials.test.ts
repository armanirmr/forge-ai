import { afterEach, describe, expect, it } from "vitest";
import { decryptUserCredential, encryptUserCredential } from "./user-credentials";

describe("user AI credential encryption", () => {
	const previousSecret = process.env.NEXTAUTH_SECRET;
	afterEach(() => {
		if (previousSecret === undefined) delete process.env.NEXTAUTH_SECRET;
		else process.env.NEXTAUTH_SECRET = previousSecret;
	});

	it("round trips while storing ciphertext instead of the supplied value", () => {
		process.env.NEXTAUTH_SECRET = "test-only-secret-for-credential-tests";
		const value = "provider-key-that-must-not-be-stored-in-plaintext";
		const encrypted = encryptUserCredential("user-1", value);
		expect(encrypted).not.toContain(value);
		expect(encrypted).toMatch(/^v1\./);
		expect(decryptUserCredential("user-1", encrypted)).toBe(value);
	});

	it("binds encrypted values to the account that created them", () => {
		process.env.NEXTAUTH_SECRET = "test-only-secret-for-credential-tests";
		const encrypted = encryptUserCredential("user-1", "secret-value");
		expect(() => decryptUserCredential("user-2", encrypted)).toThrow(/could not be decrypted/);
	});

	it("rejects tampered ciphertext", () => {
		process.env.NEXTAUTH_SECRET = "test-only-secret-for-credential-tests";
		const encrypted = encryptUserCredential("user-1", "secret-value");
		const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith("a") ? "b" : "a"}`;
		expect(() => decryptUserCredential("user-1", tampered)).toThrow(/could not be decrypted/);
	});

	it("fails closed without the application secret", () => {
		delete process.env.NEXTAUTH_SECRET;
		expect(() => encryptUserCredential("user-1", "secret-value")).toThrow(/NEXTAUTH_SECRET/);
	});
});
