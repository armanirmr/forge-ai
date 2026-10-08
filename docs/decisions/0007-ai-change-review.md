# 0007: AI review of changes

## Decision

- An AI reviewer gives an opinion on the final diff against the requirement and acceptance
  criteria. It is advisory: it never approves, rejects or blocks anything.
- It costs one provider request, started by a human. The input is secret-redacted and the
  diff is capped; files that do not fit are listed as not reviewed.
- Output is validated deterministically: every quoted line must exist in the diff, paths must
  be changed files, criteria must be known ids and each criterion needs one coverage entry.
  Only findings about something absent (a missing requirement or test) may have no quote.
- A review is stored with the hash of the edits it looked at, and is hidden if the edits change.

## Known limitations

- The quote check proves a line exists, not that the claim about it is right.
- The reviewer sees the diff and summaries, not the whole repository, so it can miss
  context or flag things the rest of the code already handles.
- Criteria come from the requirement analysis, not the plan's per-task criteria.
- Small free models may be inconsistent; a failed review can be re-run.
