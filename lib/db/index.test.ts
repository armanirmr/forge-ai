import { afterEach, describe, expect, it, vi } from "vitest";

describe("database initialization", () => {
	const originalDatabaseUrl = process.env.DATABASE_URL;

	afterEach(() => {
		if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
		else process.env.DATABASE_URL = originalDatabaseUrl;
		vi.resetModules();
	});

	it("does not require DATABASE_URL while importing the database module", async () => {
		delete process.env.DATABASE_URL;
		vi.resetModules();

		const { db } = await import("./index");

		expect(db).toBeDefined();
		expect(() => db.select).toThrow("DATABASE_URL is not set and HYPERDRIVE is unavailable");
	});

	it("uses the request-scoped Hyperdrive connection string when available", async () => {
		const contextKey = {};
		const postgresMock = vi.fn(() => ({}));
		const drizzleMock = vi.fn(() => ({ select: vi.fn() }));

		vi.doMock("@opennextjs/cloudflare", () => ({
			getCloudflareContext: () => ({
				ctx: contextKey,
				env: { HYPERDRIVE: { connectionString: "postgres://hyperdrive-test" } },
			}),
		}));
		vi.doMock("postgres", () => ({ default: postgresMock }));
		vi.doMock("drizzle-orm/postgres-js", () => ({ drizzle: drizzleMock }));
		vi.resetModules();

		const { db } = await import("./index");
		void db.select;

		expect(postgresMock).toHaveBeenCalledWith("postgres://hyperdrive-test", {
			max: 5,
			fetch_types: false,
		});

		vi.doUnmock("@opennextjs/cloudflare");
		vi.doUnmock("postgres");
		vi.doUnmock("drizzle-orm/postgres-js");
	});
});
