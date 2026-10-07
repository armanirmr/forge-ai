# 0005: Repair loop

## Decision

- A failed verification can be repaired by a Debugger agent, at most 3 attempts per workflow,
  triggered by a human. The loop stops on a pass, on exhaustion, when the debugger returns
  cannotFixReason, or on a provider failure (which does not consume an attempt).
- Repairs are additional search/replace edits stacked after the generated edits, validated by
  the same scope, secret and applies-cleanly checks. Verification always applies generated plus
  accepted repair edits in order.
- Only real evidence reaches the debugger: redacted failure output, current file contents,
  and the outcomes of earlier attempts.
- A deterministic guard rejects test edits that add skip/todo/only or remove test cases or
  assertions. It cannot detect loosened expected values; repair diffs need human review.
- Infrastructure errors ("error") and "not_executed" results are never repaired.

## Known limitations

- Only the plan's files are editable, so a fix needed elsewhere ends in cannotFixReason.
- No baseline run, so pre-existing failures can look like regressions.
- The loop runs inside one request and can take several minutes.
- The loop itself has no unit tests; its pure parts do. It is verified by live runs.
