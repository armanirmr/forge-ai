import { describe, expect, it } from "vitest";
import { pullRequestBranchName } from "./pull-request";

describe("pullRequestBranchName", () => {
	it("uses the Changeweft prefix and stable workflow and edit identifiers", () => {
		expect(pullRequestBranchName("12345678-workflow", "abcdef0123456789"))
			.toBe("changeweft/12345678-abcdef0123");
	});
});
