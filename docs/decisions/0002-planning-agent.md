# 0002: Planning agent

## Decision

- Planning is a separate, user-triggered step after analysis, so a human reviews the analysis first.
- Tasks may only depend on earlier tasks, so the dependency graph is acyclic by construction.
- Tasks split `modifiesFiles` (must exist in the file tree) from `createsFiles` (must not exist).
- Every functional requirement must be covered by a task, and every task must cite real requirement ids.
- A failed plan returns the workflow to `analysis_completed` with the error; the analysis is not discarded.

## Known limitations (Milestone 2)

- Plans are drafts. The approval gate arrives in Phase 10.
- Planning runs inside the request. A server crash mid-request can leave a workflow in `planning`.
- The file tree sent to the model is capped, so valid files outside the cap are rejected as invented.
- Groq runs in strict structured-output mode by default (`AI_STRICT_SCHEMA=false` disables it).
