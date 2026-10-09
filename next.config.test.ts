import { afterEach, describe, expect, it, vi } from "vitest";

describe("Next.js Cloudflare development setup", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.doUnmock("@opennextjs/cloudflare");
		vi.resetModules();
	});

	it("does not start local Wrangler emulation during a production build", async () => {
		const initOpenNextCloudflareForDev = vi.fn();
		vi.doMock("@opennextjs/cloudflare", () => ({ initOpenNextCloudflareForDev }));
		vi.stubEnv("NODE_ENV", "production");
		vi.resetModules();

		await import("./next.config");

		expect(initOpenNextCloudflareForDev).not.toHaveBeenCalled();
	});

	it("starts local Wrangler emulation during development", async () => {
		const initOpenNextCloudflareForDev = vi.fn();
		vi.doMock("@opennextjs/cloudflare", () => ({ initOpenNextCloudflareForDev }));
		vi.stubEnv("NODE_ENV", "development");
		vi.resetModules();

		await import("./next.config");

		expect(initOpenNextCloudflareForDev).toHaveBeenCalledOnce();
	});
});
