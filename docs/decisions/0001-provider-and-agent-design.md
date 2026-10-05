# 0001: Provider interface and agent design

## Decision
- Providers expose one method, `generateStructured`, and return UNVALIDATED output.
  Validation (Zod + semantic checks) lives in `runAgent`, so no provider can put
  unvalidated data into application state.
- Agents are definitions (prompt, schemas, semantic checks), not classes.
- The plan's per-task interface (`analyzeRequirement`, `generateCode`, ...) is
  intentionally not used: it would duplicate provider code for every agent.

## Known limitations (Milestone 1)
- The GitHub access token is stored in the Auth.js JWT session and exposed via the
  session callback. Do not pass `session` to client components. Revisit before deployment.
- Retrieval is keyword-based (English only). Embeddings arrive with Phase 3.
- Analysis runs inside the request (synchronously). A job queue arrives with the sandbox.
- `ai_runs.project_id` and `ai_runs.workflow_id` have no foreign keys yet.