# 0004: Verification sandbox

## Decision

- Generated changes are verified in a throwaway Docker container, never on the host.
- Commands come from package.json scripts (typecheck, lint, test) and are chosen by
  ForgeAI. The model never supplies commands.
- Dependencies install with network access and `--ignore-scripts`. The container is then
  disconnected from the network, and a DNS probe must confirm isolation before any check runs.
- Resource limits: 1 GB memory, 1 CPU, 512 processes, all capabilities dropped except CHOWN,
  no-new-privileges, no bind mounts.
- Stored results are the real exit codes and redacted output. "Passed" means the scripts
  exited 0, not that the change is correct.

## Known limitations

- The workspace is rebuilt from indexed files: lockfiles, binaries, .env files and files over
  500 KB are missing, and repositories over the import cap are incomplete.
- No baseline run, so failures that already existed cannot be told apart from new ones.
- Test counts are not parsed; only per-script exit codes are shown.
- Node/npm repositories only.
- The server needs access to the Docker CLI on the same machine.
