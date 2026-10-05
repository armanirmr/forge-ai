# AGENTS.md

## Never
- Fabricate test results.
- Claim code works without validation.
- Invent repository files.
- Modify unrelated files.
- Expose secrets to AI providers.
- Automatically merge pull requests.
- Bypass human approval.
- Silently overwrite user changes.
- Use unvalidated LLM output as application state.
- Execute arbitrary shell commands without sandboxing.
- Hide AI failures.
- Fabricate productivity metrics.

## Always
- Validate AI output with schemas.
- Preserve existing architecture.
- Inspect existing code before modifying it.
- Minimize file changes.
- Generate tests for changes.
- Run validation after modifications.
- Explain implementation decisions.
- Surface uncertainty.
- Record AI workflow events.
- Require human approval before shipping.

## Validation commands
npm run typecheck · npm run lint · npm test