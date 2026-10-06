# 0002: Planning agent

## Decision

- Planning is a separate, user-triggered step after analysis, so a human reviews the analysis first.
- Tasks may only depend on earlier tasks, so the dependency graph is acyclic by construction.
- Tasks split `modifiesFiles` (must exist in the file tree) from `createsFiles` (must not exist).
- Every functional requirement must be covered by a task, and every task must cite real requirement ids.
- A failed plan returns the workflow to `analysis_completed` with the error; the analysis is not discarded.
- Acceptance criteria must be grounded in the supplied repository context (prompt `implementation-planning@1.0.1`). A deterministic check rejects HTTP status codes when no HTTP layer appears in the file tree or snippets, and the rejection feeds the repair retry.
- A reviewer can request changes in plain language. The draft is discarded, any approval is withdrawn, and a new plan is generated with the feedback. The discarded plan is kept in the `PLAN_CHANGES_REQUESTED` event.

## Known limitations (Milestone 2)

- Plans are drafts. The approval gate arrives in Phase 10.
- Planning runs inside the request. A server crash mid-request can leave a workflow in `planning`.
- The file tree sent to the model is capped, so valid files outside the cap are rejected as invented.
- Groq runs in strict structured-output mode by default (`AI_STRICT_SCHEMA=false` disables it).
- The grounding rules are guidance to the model. Only the status-code check is enforced in code.
- HTTP-layer detection looks at the file tree and retrieved snippets only, so it can miss an HTTP layer in files that were not retrieved.
- Requesting changes is blocked once code has been generated for the workflow.
