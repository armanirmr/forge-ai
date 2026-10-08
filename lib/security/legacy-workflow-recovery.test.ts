import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({
	update: vi.fn(),
	set: vi.fn(),
	where: vi.fn(),
	returning: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: { update: mocks.update } }));

import { recoverLegacyWorkflowCreators } from "./legacy-workflow-recovery";

describe("legacy workflow recovery scope", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.returning.mockResolvedValue([{ id: "wf-1" }, { id: "wf-2" }]);
		mocks.where.mockReturnValue({ returning: mocks.returning });
		mocks.set.mockReturnValue({ where: mocks.where });
		mocks.update.mockReturnValue({ set: mocks.set });
	});

	it("reassigns only matching legacy creators within the verified repository", async () => {
		await expect(recoverLegacyWorkflowCreators(
			"repo-verified",
			"current-user",
			["github-login", "Verified Display Name"],
		)).resolves.toBe(2);

		expect(mocks.set).toHaveBeenCalledWith({ createdByUserId: "current-user" });
		const query = new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0]);
		expect(query.sql).toContain('"repository_id" = $1');
		expect(query.sql).toContain('"created_by_user_id" in');
		expect(query.params).toEqual([
			"repo-verified",
			"github-login",
			"Verified Display Name",
		]);
	});
});
