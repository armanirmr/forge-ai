# 0006: Review and approval of changes

## Decision

- The reviewer sees the final result per file (generated edits plus accepted repairs) as a
  diff with context, plus deterministic flags. No AI is involved.
- Approval requires workflow status changes_generated, a latest verification of "passed", and
  that run being newer than the last edit. The server rechecks all of it; there is no override.
- A decision (approve or reject) is final for the workflow and records who, when, a reason
  for rejections, and a SHA-256 hash of the exact effective edits.
- Approval does not apply the edits anywhere. PR creation is a later milestone.

## Known limitations

- "passed" means the repository's scripts exited 0. Repositories without typecheck, lint or
  tests are only as verified as their scripts allow, and skipped checks are shown as notes.
- Flags are heuristics. They cannot judge whether the change matches the requirement.
- A refused approval (state changed meanwhile) gives no on-page message.
- The review page rebuilds the workspace on every load.
- Rejection and approval cannot be undone from the UI.
