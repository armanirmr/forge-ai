import { afterEach, describe, expect, it, vi } from "vitest";

describe("Auth.js Cloudflare configuration", () => {
	afterEach(() => {
		vi.doUnmock("next-auth");
		vi.doUnmock("next-auth/providers/github");
		vi.doUnmock("@/lib/auth/identity");
		vi.resetModules();
	});

	it("trusts the Cloudflare Worker request host", async () => {
		const nextAuth = vi.fn(() => ({
			handlers: {},
			auth: vi.fn(),
			signIn: vi.fn(),
			signOut: vi.fn(),
		}));
		vi.doMock("next-auth", () => ({ default: nextAuth }));
		vi.doMock("next-auth/providers/github", () => ({
			default: vi.fn(() => ({ id: "github" })),
		}));
		vi.doMock("@/lib/auth/identity", () => ({ stableUserSubject: vi.fn() }));

		await import("./auth");

		expect(nextAuth).toHaveBeenCalledWith(expect.objectContaining({ trustHost: true }));
	});
});
