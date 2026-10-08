# 0008: Create a pull request from approved edits

## Decision

- Pull request creation is an explicit server action available only after a human approval.
- Before writing, the server re-loads the effective edits and checks their hash against the approval, confirms the latest verification is still `passed` and current, and requires the requester to be the approving user.
- The action creates one deterministic `changeweft/<workflow>-<hash>` branch and one commit from the current default branch. It compares every touched remote file with the indexed original first; any drift aborts before branch creation.
- PR content is built from stored requirement, changed paths, actual verification results, the approval record, and a matching-hash AI review when available. It never invents test results or treats AI review as approval.
- A database row and workflow events record the approved hash, branch, commit, PR number and URL. Failed attempts are visible and do not alter the approval.
- The existing `public_repo` OAuth scope is retained. This milestone supports public repositories; private-repository support would require the broader `repo` scope and a separate permission decision.
- Changeweft never merges the PR.

## Known limitations

- If GitHub accepts branch creation but the request fails before PR creation completes, the branch remains. The failed record names it; Changeweft will not force-update or delete it automatically.
- Repository files omitted during import cannot be changed by the existing generation pipeline. Drift on any touched file blocks the PR.
- A successful PR creation does not guarantee CI passes or that the PR is merged.
