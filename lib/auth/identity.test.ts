import { describe, expect, it } from "vitest";
import { stableUserSubject } from "./identity";

describe("stableUserSubject", () => {
	it("uses GitHub's stable account ID instead of Auth.js's sign-in UUID", () => {
		expect(stableUserSubject("random-sign-in-uuid", {
			provider: "github",
			providerAccountId: "12345678",
		})).toBe("12345678");
	});

	it("keeps the persisted subject on session refreshes", () => {
		expect(stableUserSubject("12345678")).toBe("12345678");
	});

	it("does not replace a subject for another provider", () => {
		expect(stableUserSubject("existing-subject", {
			provider: "another-provider",
			providerAccountId: "different-account",
		})).toBe("existing-subject");
	});
});
