import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({
	select: vi.fn(),
	from: vi.fn(),
	innerJoin: vi.fn(),
	where: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));

import { getOwnedRepository, getOwnedWorkflow, getOwnedWorkflowScope } from "./tenant-access";

const dialect = new PgDialect();

describe("tenant access queries", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.select.mockReturnValue({ from: mocks.from });
		const builder = { innerJoin: mocks.innerJoin, where: mocks.where };
		mocks.innerJoin.mockReturnValue(builder);
		mocks.from.mockReturnValue(builder);
		mocks.where.mockResolvedValue([]);
	});

	it("filters repository lookup by both ID and account owner", async () => {
		await expect(getOwnedRepository("repo-1", "user-1")).resolves.toBeNull();
		const query = dialect.sqlToQuery(mocks.where.mock.calls[0][0]);
		expect(query.sql).toContain('"owner_user_id"');
		expect(query.sql).toContain('"id" = $1');
		expect(query.sql).toContain('"owner_user_id" = $2');
		expect(query.params).toEqual(["repo-1", "user-1"]);
	});

	it("filters workflow lookup through its repository owner", async () => {
		await expect(getOwnedWorkflow("workflow-1", "user-1")).resolves.toBeNull();
		const query = dialect.sqlToQuery(mocks.where.mock.calls[0][0]);
		expect(query.sql).toContain('"owner_user_id"');
		expect(query.sql).toContain('"created_by_user_id"');
		expect(query.params).toEqual(["workflow-1", "user-1", "user-1"]);
	});

	it("scopes analytics to both the repository owner and workflow creator", () => {
		const query = dialect.sqlToQuery(getOwnedWorkflowScope("user-1")!);
		expect(query.sql).toContain('"owner_user_id" = $1');
		expect(query.sql).toContain('"created_by_user_id" = $2');
		expect(query.params).toEqual(["user-1", "user-1"]);
	});
});
