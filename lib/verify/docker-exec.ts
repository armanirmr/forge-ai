import { spawn } from "node:child_process";
import type { DockerExec } from "./docker-verify";

const MAX_CAPTURE = 200_000;

export const dockerExec: DockerExec = (args, { timeoutMs }) =>
	new Promise((resolve) => {
		const started = Date.now();
		let output = "";
		let timedOut = false;
		let settled = false;

		const child = spawn("docker", args, {
			windowsHide: true,
			stdio: ["ignore", "pipe", "pipe"],
		});

		const append = (chunk: Buffer) => {
			output += chunk.toString("utf8");
			if (output.length > MAX_CAPTURE * 2) output = output.slice(-MAX_CAPTURE);
		};
		child.stdout.on("data", append);
		child.stderr.on("data", append);

		// Killing the CLI does not stop the process inside the container; the
		// orchestrator always removes the container afterwards, which does.
		const timer = setTimeout(() => {
			timedOut = true;
			child.kill();
		}, timeoutMs);

		const done = (exitCode: number | null) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve({
				exitCode,
				timedOut,
				output: output.slice(-MAX_CAPTURE),
				durationMs: Date.now() - started,
			});
		};

		child.on("error", (err) => {
			output += `\n${err.message}`;
			done(null);
		});
		child.on("close", (code) => done(code));
	});
