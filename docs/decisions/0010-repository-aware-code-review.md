# 0010: Repository-aware Code Reviewer

## Decision

- Enrich the existing advisory change review with up to five matching snippets from the indexed repository snapshot.
- Search with the requirement and acceptance criteria using the existing hybrid semantic and keyword retrieval.
- Cap the context sent to the reviewer at 6,000 characters and redact detected secrets.
- Treat repository context as untrusted, partial background. Review findings still require evidence from the changed diff; context cannot create approval or block a human decision.
- If retrieval fails or returns no snippets, continue with the existing diff-only review and record the context status in the workflow event.

## Limitations

- Context can be stale until the repository is re-indexed and may not include relevant files.
- Review output remains an AI opinion. Exact evidence validation proves only that a quote appears in the diff, not that the finding is correct.
