import { afterEach, describe, expect, it, vi } from "vitest";

describe("GitHub access token session lookup", () => {
	afterEach(() => {
		vi.doUnmock("server-only");
		vi.doUnmock("next/headers");
		vi.doUnmock("next-auth/jwt");
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	it("reads the secure Auth.js cookie on an HTTPS deployment", async () => {
		const requestHeaders = new Headers({ cookie: "__Secure-authjs.session-token=session" });
		const headers = vi.fn().mockResolvedValue(requestHeaders);
		const getToken = vi.fn().mockResolvedValue({ accessToken: "github-token" });
		vi.doMock("server-only", () => ({}));
		vi.doMock("next/headers", () => ({ headers }));
		vi.doMock("next-auth/jwt", () => ({ getToken }));
		vi.stubEnv("NEXTAUTH_URL", "https://changeweft.armanirmr.workers.dev");
		vi.stubEnv("NEXTAUTH_SECRET", "test-secret");

		const { getGitHubAccessToken } = await import("./access-token");

		await expect(getGitHubAccessToken()).resolves.toBe("github-token");
		expect(getToken).toHaveBeenCalledWith(expect.objectContaining({
			req: { headers: requestHeaders },
			secret: "test-secret",
			secureCookie: true,
		}));
	});

	it("uses the non-secure Auth.js cookie for local HTTP development", async () => {
		const headers = vi.fn().mockResolvedValue(new Headers());
		const getToken = vi.fn().mockResolvedValue(null);
		vi.doMock("server-only", () => ({}));
		vi.doMock("next/headers", () => ({ headers }));
		vi.doMock("next-auth/jwt", () => ({ getToken }));
		vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");

		const { getGitHubAccessToken } = await import("./access-token");

		await expect(getGitHubAccessToken()).resolves.toBeUndefined();
		expect(getToken).toHaveBeenCalledWith(expect.objectContaining({ secureCookie: false }));
	});
});
