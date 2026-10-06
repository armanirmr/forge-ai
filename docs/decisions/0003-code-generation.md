# 0003: Code generation

## Decision

- Code generation only runs on a plan a human has approved. The approval and the approver are recorded in the timeline.
- The model returns search/replace edit blocks, not whole files or unified diffs. Each search must match the file exactly once, so validation is deterministic and never trusts model-supplied line numbers.
- Patch validation (`lib/patch/apply-edits.ts`) applies edits to an in-memory copy. A failure feeds the same repair retry as schema errors.
- Edits are scoped per task: only that task's `modifiesFiles` and `createsFiles` may be touched.
- Output that looks like a secret is rejected, and files to be edited are never sent if they look like they hold one.
- Nothing is written to any repository in this milestone.

## Known limitations (Milestone 3)

- One generation call for the whole plan, with a 60,000 character context cap.
- Edits assume LF line endings. CRLF files may fail to match.
- Generated code is not executed or tested yet; that is the testing phase.
- No unified diff or `git apply` output yet; the viewer shows removed and added text per edit.
- Plan approval has no reject or request-changes path yet.
