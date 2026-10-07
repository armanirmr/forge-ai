import { describe, expect, it } from "vitest";
import {
	type DockerExec,
	type ExecResult,
	verifyInDocker,
} from "./docker-verify";
import type { Check } from "./select-checks";

const testCheck: Check[] = [{ name: "test", command: ["npm", "test"] }];

async function run(
	overrides: (
		line: string,
		args: string[],
	) => Partial<ExecResult> | undefined = () => undefined,
	checks: Check[] = testCheck,
) {
	const calls: string[][] = [];
	const exec: DockerExec = async (args) => {
		calls.push(args);
		return {
			exitCode: 0,
			timedOut: false,
			output: "ok",
			durationMs: 5,
			...overrides(args.join(" "), args),
		};
	};
	const result = await verifyInDocker({
		workspaceDir: "/tmp/ws",
		checks,
		skipped: [],
		notes: [],
		exec,
	});
	return { result, lines: calls.map((a) => a.join(" ")) };
}

const at = (lines: string[], needle: string) =>
	lines.findIndex((l) => l.includes(needle));
const isTest = (line: string) => line.endsWith(" npm test");

describe("verifyInDocker", () => {
	it("does not touch Docker when there is nothing to run", async () => {
		const { result, lines } = await run(() => undefined, []);
		expect(result.status).toBe("not_executed");
		expect(lines).toEqual([]);
	});

	it("reports an error when Docker is unavailable", async () => {
		const { result, lines } = await run((_l, args) =>
			args[0] === "version" ? { exitCode: 1 } : undefined,
		);
		expect(result.status).toBe("error");
		expect(result.message).toMatch(/Docker is not available/);
		expect(lines).toHaveLength(1);
	});

	it("installs with network, then removes the network before running checks", async () => {
		const { result, lines } = await run();
		expect(result.status).toBe("passed");
		expect(result.steps.map((s) => s.name)).toEqual(["install", "test"]);

		const order = [
			lines.findIndex((l) => l.startsWith("create ")),
			lines.findIndex((l) => l.startsWith("cp ")),
			at(lines, "npm install"),
			at(lines, "network disconnect"),
			at(lines, "dns"),
			lines.findIndex(isTest),
			lines.findIndex((l) => l.startsWith("rm -f")),
		];
		expect(order.every((i) => i >= 0)).toBe(true);
		expect([...order].sort((a, b) => a - b)).toEqual(order);
		expect(result.cleanupOk).toBe(true);
	});

	it("marks a failing check as failed and still removes the container", async () => {
		const { result, lines } = await run((l) =>
			isTest(l) ? { exitCode: 1, output: "FAIL" } : undefined,
		);
		expect(result.status).toBe("failed");
		expect(result.steps.at(-1)).toMatchObject({ name: "test", exitCode: 1 });
		expect(lines.some((l) => l.startsWith("rm -f"))).toBe(true);
	});

	it("stops with an error when installation fails", async () => {
		const { result, lines } = await run((l) =>
			l.includes("npm install") ? { exitCode: 1 } : undefined,
		);
		expect(result.status).toBe("error");
		expect(lines.some((l) => l.includes("network disconnect"))).toBe(false);
		expect(lines.some(isTest)).toBe(false);
		expect(lines.some((l) => l.startsWith("rm -f"))).toBe(true);
	});

	it("does not run checks when network isolation cannot be confirmed", async () => {
		const { result, lines } = await run((l) =>
			l.includes("dns") ? { exitCode: 1 } : undefined,
		);
		expect(result.status).toBe("error");
		expect(result.message).toMatch(/isolation/);
		expect(lines.some(isTest)).toBe(false);
	});

	it("creates a restricted container", async () => {
		const { lines } = await run();
		const create = lines.find((l) => l.startsWith("create "))!;
		for (const flag of [
			"--cap-drop ALL",
			"--memory 1g",
			"--pids-limit 512",
			"--security-opt no-new-privileges",
		]) {
			expect(create).toContain(flag);
		}
		expect(create).not.toContain("--privileged");
		expect(create).not.toContain("--volume");
		expect(create).not.toMatch(/ -v /);
	});

	it("records a timed-out check as failed", async () => {
		const { result } = await run((l) =>
			isTest(l) ? { exitCode: null, timedOut: true, output: "" } : undefined,
		);
		expect(result.status).toBe("failed");
		expect(result.steps.at(-1)?.timedOut).toBe(true);
	});

	it("redacts secrets from stored output", async () => {
		const token = `ghp_${"a".repeat(36)}`;
		const { result } = await run((l) =>
			isTest(l) ? { output: `leaked ${token}` } : undefined,
		);
		const output = result.steps.at(-1)!.output;
		expect(output).not.toContain(token);
		expect(output).toContain("[REDACTED");
	});

	it("reports when the container could not be removed", async () => {
		const { result } = await run((_l, args) =>
			args[0] === "rm" ? { exitCode: 1 } : undefined,
		);
		expect(result.cleanupOk).toBe(false);
	});
});
