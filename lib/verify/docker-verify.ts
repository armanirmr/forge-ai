import { randomUUID } from "node:crypto";
import { redactSecrets } from "@/lib/security/redact";
import type { Check } from "./select-checks";
import type { StepResult, VerificationResult } from "./types";

export type ExecResult = {
	exitCode: number | null;
	timedOut: boolean;
	output: string;
	durationMs: number;
};
export type DockerExec = (
	args: string[],
	opts: { timeoutMs: number },
) => Promise<ExecResult>;

export const SANDBOX_IMAGE = "node:22-slim";
const MAX_STORED_OUTPUT = 20_000;
const TIMEOUTS = {
	quick: 30_000,
	create: 600_000,
	copy: 120_000,
	install: 300_000,
	check: 180_000,
};

// Exit 0 means the lookup FAILED, i.e. the sandbox has no network.
const NETWORK_PROBE =
	"require('dns').lookup('example.com',(e)=>process.exit(e?0:1))";

function tail(text: string): string {
	const redacted = redactSecrets(text).text;
	return redacted.length > MAX_STORED_OUTPUT
		? `[…truncated]\n${redacted.slice(-MAX_STORED_OUTPUT)}`
		: redacted;
}

function toStep(name: string, command: string[], r: ExecResult): StepResult {
	return {
		name,
		command: command.join(" "),
		exitCode: r.exitCode,
		timedOut: r.timedOut,
		durationMs: r.durationMs,
		output: tail(r.output),
	};
}

export type VerifyInput = {
	workspaceDir: string;
	checks: Check[];
	skipped: { name: string; reason: string }[];
	notes: string[];
	exec: DockerExec;
	image?: string;
};

export async function verifyInDocker(
	input: VerifyInput,
): Promise<VerificationResult> {
	const image = input.image ?? SANDBOX_IMAGE;
	const base = { image, skipped: input.skipped, notes: input.notes };

	if (input.checks.length === 0) {
		return {
			...base,
			status: "not_executed",
			message: "There were no scripts to run.",
			steps: [],
			cleanupOk: true,
		};
	}

	const run = (args: string[], timeoutMs: number) =>
		input.exec(args, { timeoutMs });

	const version = await run(
		["version", "--format", "{{.Server.Version}}"],
		TIMEOUTS.quick,
	);
	if (version.exitCode !== 0) {
		return {
			...base,
			status: "error",
			message: "Docker is not available. Start Docker Desktop and try again.",
			steps: [],
			cleanupOk: true,
		};
	}

	const name = `forge-verify-${randomUUID().slice(0, 8)}`;
	const steps: StepResult[] = [];
	const fail = (message: string): VerificationResult => ({
		...base,
		status: "error",
		message,
		steps,
		cleanupOk: true,
	});
	const execArgs = (user: string, command: string[]) => [
		"exec",
		"-u",
		user,
		"-w",
		"/work",
		"-e",
		"HOME=/home/node",
		"-e",
		"CI=true",
		name,
		...command,
	];

	const execute = async (): Promise<VerificationResult> => {
		const setup: [string, string[], number][] = [
			[
				"create",
				[
					"create",
					"--name",
					name,
					"--memory",
					"1g",
					"--memory-swap",
					"1g",
					"--cpus",
					"1",
					"--pids-limit",
					"512",
					"--cap-drop",
					"ALL",
					"--cap-add",
					"CHOWN",
					"--security-opt",
					"no-new-privileges",
					image,
					"tail",
					"-f",
					"/dev/null",
				],
				TIMEOUTS.create,
			],
			["start", ["start", name], TIMEOUTS.quick],
			["copy", ["cp", input.workspaceDir, `${name}:/work`], TIMEOUTS.copy],
			[
				"chown",
				["exec", "-u", "root", name, "chown", "-R", "node:node", "/work"],
				TIMEOUTS.quick,
			],
		];
		for (const [label, args, timeout] of setup) {
			const r = await run(args, timeout);
			if (r.exitCode !== 0)
				return fail(`Sandbox setup failed at "${label}": ${tail(r.output)}`);
		}

		const installCommand = [
			"npm",
			"install",
			"--ignore-scripts",
			"--no-audit",
			"--no-fund",
		];
		const install = await run(
			execArgs("node", installCommand),
			TIMEOUTS.install,
		);
		steps.push(toStep("install", installCommand, install));
		if (install.exitCode !== 0) {
			return fail(
				install.timedOut
					? "Dependency installation timed out, so no checks were run."
					: "Dependency installation failed, so no checks were run.",
			);
		}

		const disconnect = await run(
			["network", "disconnect", "bridge", name],
			TIMEOUTS.quick,
		);
		if (disconnect.exitCode !== 0) {
			return fail(
				`Could not remove network access from the sandbox, so no checks were run: ${tail(disconnect.output)}`,
			);
		}
		const probe = await run(
			execArgs("node", ["node", "-e", NETWORK_PROBE]),
			TIMEOUTS.quick,
		);
		if (probe.exitCode !== 0) {
			return fail(
				"Network isolation could not be confirmed, so no checks were run.",
			);
		}

		for (const check of input.checks) {
			const r = await run(execArgs("node", check.command), TIMEOUTS.check);
			steps.push(toStep(check.name, check.command, r));
		}

		const failed = steps
			.filter((s) => s.name !== "install")
			.some((s) => s.exitCode !== 0 || s.timedOut);
		return {
			...base,
			status: failed ? "failed" : "passed",
			message: null,
			steps,
			cleanupOk: true,
		};
	};

	let result: VerificationResult;
	try {
		result = await execute();
	} catch (err) {
		result = fail(err instanceof Error ? err.message : String(err));
	}

	// Always remove the container, which also kills anything still running in it.
	const cleanup = await run(["rm", "-f", "-v", name], TIMEOUTS.quick);
	return { ...result, cleanupOk: cleanup.exitCode === 0 };
}
