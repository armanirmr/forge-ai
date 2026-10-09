import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Cloudflare Wrangler config", () => {
	it("provides a local-only Hyperdrive URL for OpenNext platform proxy", () => {
		const config = JSON.parse(readFileSync("wrangler.jsonc", "utf8")) as {
			hyperdrive: Array<{
				binding: string;
				id: string;
				localConnectionString?: string;
			}>};
		const hyperdrive = config.hyperdrive.find(({ binding }) => binding === "HYPERDRIVE");

		expect(hyperdrive).toMatchObject({
			id: "3a86f1bd340749bdace3aeb049320b08",
			localConnectionString: "postgres://local:local@127.0.0.1:5432/local",
		});
	});
});
